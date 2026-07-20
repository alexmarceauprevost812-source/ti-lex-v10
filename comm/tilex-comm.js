/* ============================================================================
 * tilex-comm.js — Moteur de communication temps réel ti-lex v10
 * ----------------------------------------------------------------------------
 * Produit du Québec · Saguenay–Lac-Saint-Jean
 *
 * Module vanilla zéro-dépendance (sauf le client Supabase, injecté).
 * Gère la communication mobile <-> ordinateur en temps réel :
 *   - Canaux Realtime (broadcast de messages entre appareils)
 *   - Présence (qui est en ligne, sur quel appareil)
 *   - Persistance des messages dans Postgres
 *   - Synchronisation d'état entre les sessions d'un même usager
 *   - Reconnexion automatique avec backoff
 *   - Système d'événements (on / off / emit)
 *
 * Le client Supabase est passé en injection pour garder ce module découplé,
 * dans le même esprit zéro-dépendance que TilexFX.
 * ============================================================================ */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * Constantes
   * ------------------------------------------------------------------------ */
  const VERSION = '10.0.0';
  const RECONNECT_BASE_MS = 1000;   // délai de base avant reconnexion
  const RECONNECT_MAX_MS = 30000;   // plafond du backoff
  const PRESENCE_HEARTBEAT_MS = 25000;

  // Types de messages que le canal sait router
  const MSG = {
    CHAT: 'chat',          // message texte entre usagers
    SYNC: 'sync',          // synchro d'état entre appareils d'un même usager
    AGENT: 'agent',        // échange avec Agent AL
    SIGNAL: 'signal',      // signal de contrôle (typing, lu, etc.)
    PING: 'ping',
  };

  /* --------------------------------------------------------------------------
   * Petit utilitaire : détection du type d'appareil
   * ------------------------------------------------------------------------ */
  function detectDevice() {
    const ua = (global.navigator && global.navigator.userAgent) || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
    const isTablet = /iPad|Tablet/i.test(ua);
    let kind = 'ordinateur';
    if (isTablet) kind = 'tablette';
    else if (isMobile) kind = 'mobile';
    return {
      kind,
      ua,
      platform: (global.navigator && global.navigator.platform) || 'inconnu',
      touch: 'ontouchstart' in global,
    };
  }

  /* --------------------------------------------------------------------------
   * Génère un identifiant de session unique et lisible
   * ------------------------------------------------------------------------ */
  function makeSessionId() {
    const rnd = Math.random().toString(36).slice(2, 8);
    const t = Date.now().toString(36);
    return `tlx-${t}-${rnd}`;
  }

  /* --------------------------------------------------------------------------
   * Émetteur d'événements minimal (pas de dépendance externe)
   * ------------------------------------------------------------------------ */
  class Emitter {
    constructor() { this._handlers = {}; }

    on(event, fn) {
      (this._handlers[event] = this._handlers[event] || []).push(fn);
      return () => this.off(event, fn);
    }

    off(event, fn) {
      const list = this._handlers[event];
      if (!list) return;
      this._handlers[event] = list.filter((h) => h !== fn);
    }

    once(event, fn) {
      const unsub = this.on(event, (...args) => { unsub(); fn(...args); });
      return unsub;
    }

    emit(event, payload) {
      const list = this._handlers[event];
      if (!list) return;
      list.slice().forEach((fn) => {
        try { fn(payload); }
        catch (err) { console.error(`[ti-lex-comm] erreur dans le handler "${event}"`, err); }
      });
    }
  }

  /* ==========================================================================
   * TilexComm — la classe principale
   * ======================================================================== */
  class TilexComm extends Emitter {
    /**
     * @param {object} opts
     * @param {object} opts.supabase  — client Supabase déjà initialisé (injecté)
     * @param {string} opts.room      — nom du canal/salon (ex: "ti-lex-al-global")
     * @param {object} [opts.user]    — { id, nom } de l'usager courant
     * @param {boolean} [opts.persist=true] — persister les messages dans Postgres
     * @param {string} [opts.table="tilex_messages"] — table de persistance
     */
    constructor(opts) {
      super();
      if (!opts || !opts.supabase) {
        throw new Error('[ti-lex-comm] Le client Supabase est requis (opts.supabase).');
      }

      this.version = VERSION;
      this.sb = opts.supabase;
      this.room = opts.room || 'ti-lex-al-global';
      this.persist = opts.persist !== false;
      this.table = opts.table || 'tilex_messages';

      this.device = detectDevice();
      this.sessionId = makeSessionId();
      this.user = opts.user || { id: null, nom: 'Anonyme' };

      this.channel = null;
      this.connected = false;
      this.reconnectAttempts = 0;
      this._heartbeat = null;
      this._presenceState = {};

      // Bind pour les listeners
      this._onVisibility = this._onVisibility.bind(this);
    }

    /* ----------------------------------------------------------------------
     * Connexion : ouvre le canal Realtime, présence + broadcast
     * -------------------------------------------------------------------- */
    async connect() {
      if (this.connected) return this;

      this.channel = this.sb.channel(this.room, {
        config: {
          broadcast: { self: false, ack: true },
          presence: { key: this.sessionId },
        },
      });

      // --- Broadcast : on écoute tous les types de messages ---
      this.channel.on('broadcast', { event: 'message' }, ({ payload }) => {
        this._routeIncoming(payload);
      });

      // --- Présence : sync, join, leave ---
      this.channel.on('presence', { event: 'sync' }, () => {
        this._presenceState = this.channel.presenceState();
        this.emit('presence', this.getOnlineDevices());
      });

      this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.emit('device:join', { key, presences: newPresences });
      });

      this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.emit('device:leave', { key, presences: leftPresences });
      });

      // --- Abonnement ---
      await new Promise((resolve, reject) => {
        this.channel.subscribe(async (status, err) => {
          if (status === 'SUBSCRIBED') {
            this.connected = true;
            this.reconnectAttempts = 0;
            await this._trackPresence();
            this._startHeartbeat();
            this._bindVisibility();
            this.emit('connect', {
              room: this.room,
              session: this.sessionId,
              device: this.device,
            });
            resolve(this);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.connected = false;
            this.emit('error', err || new Error(`Canal en état ${status}`));
            this._scheduleReconnect();
            reject(err || new Error(status));
          } else if (status === 'CLOSED') {
            this.connected = false;
            this.emit('disconnect', { reason: 'CLOSED' });
          }
        });
      }).catch(() => { /* la reconnexion est déjà planifiée */ });

      return this;
    }

    /* ----------------------------------------------------------------------
     * Déclare la présence de cet appareil sur le canal
     * -------------------------------------------------------------------- */
    async _trackPresence() {
      if (!this.channel) return;
      await this.channel.track({
        session: this.sessionId,
        user_id: this.user.id,
        nom: this.user.nom,
        device: this.device.kind,
        platform: this.device.platform,
        joined_at: new Date().toISOString(),
      });
    }

    /* ----------------------------------------------------------------------
     * Heartbeat : garde la présence fraîche même si l'onglet est inactif
     * -------------------------------------------------------------------- */
    _startHeartbeat() {
      this._stopHeartbeat();
      this._heartbeat = setInterval(() => {
        if (this.connected) {
          this.send(MSG.PING, { t: Date.now() }, { persist: false });
        }
      }, PRESENCE_HEARTBEAT_MS);
    }

    _stopHeartbeat() {
      if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
    }

    /* ----------------------------------------------------------------------
     * Reconnexion avec backoff exponentiel
     * -------------------------------------------------------------------- */
    _scheduleReconnect() {
      this.reconnectAttempts += 1;
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts - 1),
        RECONNECT_MAX_MS
      );
      this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
      setTimeout(() => {
        if (!this.connected) {
          this._teardownChannel();
          this.connect();
        }
      }, delay);
    }

    /* ----------------------------------------------------------------------
     * Gère la visibilité de l'onglet (mobile : économise la batterie)
     * -------------------------------------------------------------------- */
    _bindVisibility() {
      if (global.document) {
        global.document.addEventListener('visibilitychange', this._onVisibility);
      }
    }

    _onVisibility() {
      const visible = global.document.visibilityState === 'visible';
      this.emit('visibility', { visible });
      if (visible && !this.connected) {
        // De retour au premier plan : on se reconnecte si besoin
        this.connect();
      }
    }

    /* ----------------------------------------------------------------------
     * ENVOI d'un message
     * @param {string} type   — un des MSG.*
     * @param {object} data   — charge utile
     * @param {object} [opts] — { persist, to }
     * -------------------------------------------------------------------- */
    async send(type, data, opts = {}) {
      const payload = {
        id: makeSessionId(),
        type: type || MSG.CHAT,
        from: {
          session: this.sessionId,
          user_id: this.user.id,
          nom: this.user.nom,
          device: this.device.kind,
        },
        to: opts.to || null,            // null = broadcast à tout le salon
        data: data || {},
        ts: new Date().toISOString(),
      };

      // Broadcast temps réel
      if (this.connected && this.channel) {
        await this.channel.send({
          type: 'broadcast',
          event: 'message',
          payload,
        });
      }

      // Persistance optionnelle dans Postgres
      const shouldPersist = opts.persist !== false
        && this.persist
        && type !== MSG.PING
        && type !== MSG.SIGNAL;

      if (shouldPersist) {
        await this._persist(payload).catch((err) => {
          this.emit('error', err);
        });
      }

      this.emit('sent', payload);
      return payload;
    }

    /* Raccourcis pratiques ------------------------------------------------ */
    sendChat(texte, to) { return this.send(MSG.CHAT, { texte }, { to }); }
    sendToAgent(prompt) { return this.send(MSG.AGENT, { prompt }); }
    syncState(state) { return this.send(MSG.SYNC, { state }, { persist: false }); }
    sendTyping(actif) { return this.send(MSG.SIGNAL, { signal: 'typing', actif }, { persist: false }); }

    /* ----------------------------------------------------------------------
     * Persiste un message dans la table Postgres
     * -------------------------------------------------------------------- */
    async _persist(payload) {
      const { error } = await this.sb.from(this.table).insert({
        msg_id: payload.id,
        room: this.room,
        type: payload.type,
        user_id: payload.from.user_id,
        nom: payload.from.nom,
        device: payload.from.device,
        destinataire: payload.to,
        contenu: payload.data,
        created_at: payload.ts,
      });
      if (error) throw error;
    }

    /* ----------------------------------------------------------------------
     * Charge l'historique récent depuis Postgres
     * -------------------------------------------------------------------- */
    async loadHistory(limit = 50) {
      const { data, error } = await this.sb
        .from(this.table)
        .select('*')
        .eq('room', this.room)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) { this.emit('error', error); return []; }
      const history = (data || []).reverse();
      this.emit('history', history);
      return history;
    }

    /* ----------------------------------------------------------------------
     * Route un message entrant vers le bon événement
     * -------------------------------------------------------------------- */
    _routeIncoming(payload) {
      if (!payload || payload.from.session === this.sessionId) return;

      // Si le message est adressé à quelqu'un d'autre, on l'ignore
      if (payload.to && payload.to !== this.sessionId && payload.to !== this.user.id) {
        return;
      }

      this.emit('message', payload);            // événement générique

      switch (payload.type) {
        case MSG.CHAT:   this.emit('chat', payload); break;
        case MSG.SYNC:   this.emit('sync', payload); break;
        case MSG.AGENT:  this.emit('agent', payload); break;
        case MSG.SIGNAL: this.emit('signal', payload); break;
        case MSG.PING:   /* silence : juste un keepalive */ break;
        default:         this.emit('unknown', payload);
      }
    }

    /* ----------------------------------------------------------------------
     * Liste des appareils en ligne (depuis l'état de présence)
     * -------------------------------------------------------------------- */
    getOnlineDevices() {
      const devices = [];
      Object.keys(this._presenceState).forEach((key) => {
        this._presenceState[key].forEach((p) => {
          devices.push({
            session: p.session,
            user_id: p.user_id,
            nom: p.nom,
            device: p.device,
            platform: p.platform,
            self: p.session === this.sessionId,
          });
        });
      });
      return devices;
    }

    /* Est-ce que le même usager est connecté ailleurs (autre appareil) ? */
    getOtherDevicesOfUser() {
      return this.getOnlineDevices().filter(
        (d) => d.user_id === this.user.id && d.session !== this.sessionId
      );
    }

    /* ----------------------------------------------------------------------
     * Met à jour l'usager courant (ex: après connexion Supabase Auth)
     * -------------------------------------------------------------------- */
    async setUser(user) {
      this.user = Object.assign({ id: null, nom: 'Anonyme' }, user);
      if (this.connected) await this._trackPresence();
      this.emit('user', this.user);
    }

    /* ----------------------------------------------------------------------
     * Démontage
     * -------------------------------------------------------------------- */
    _teardownChannel() {
      if (this.channel) {
        try { this.sb.removeChannel(this.channel); } catch (e) { /* noop */ }
        this.channel = null;
      }
    }

    async disconnect() {
      this._stopHeartbeat();
      if (global.document) {
        global.document.removeEventListener('visibilitychange', this._onVisibility);
      }
      if (this.channel) {
        await this.channel.untrack().catch(() => {});
        this._teardownChannel();
      }
      this.connected = false;
      this.emit('disconnect', { reason: 'manual' });
    }
  }

  /* Expose les types de messages sur la classe pour usage externe */
  TilexComm.MSG = MSG;
  TilexComm.VERSION = VERSION;
  TilexComm.detectDevice = detectDevice;

  /* --------------------------------------------------------------------------
   * Export universel (ESM / CommonJS / global)
   * ------------------------------------------------------------------------ */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TilexComm;
  } else {
    global.TilexComm = TilexComm;
  }

})(typeof window !== 'undefined' ? window : globalThis);
