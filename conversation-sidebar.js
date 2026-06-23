// ti-lex v10 — Sidebar de conversations

const SIDEBAR_CSS = `
#cm-sidebar {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: 280px; z-index: 1000;
  background: #0d0d0d;
  border-right: 1px solid rgba(255,127,39,.15);
  display: flex; flex-direction: column;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  transform: translateX(-100%);
  transition: transform .3s cubic-bezier(.22,1,.36,1);
  box-shadow: 4px 0 40px rgba(0,0,0,.5);
}
#cm-sidebar.open { transform: translateX(0); }

#cm-overlay {
  position: fixed; inset: 0; z-index: 999;
  background: rgba(0,0,0,.6); backdrop-filter: blur(3px);
  display: none;
}
#cm-overlay.show { display: block; }

.cm-head {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 14px 14px;
  border-bottom: 1px solid rgba(255,127,39,.12);
}
.cm-logo {
  font-size: 11px; font-weight: 700; letter-spacing: 2px;
  color: #ff7f27; flex: 1;
}
.cm-new-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 6px;
  background: #ff7f27; color: #0a0a0a;
  border: none; font-family: inherit; font-size: 11px;
  font-weight: 700; letter-spacing: 1px; cursor: pointer;
  transition: filter .2s;
}
.cm-new-btn:hover { filter: brightness(1.12); }

.cm-tabs {
  display: flex; border-bottom: 1px solid rgba(255,127,39,.12);
}
.cm-tab {
  flex: 1; padding: 10px 4px; text-align: center;
  font-size: 10px; letter-spacing: 1.5px; font-weight: 700;
  color: #666; background: none; border: none;
  cursor: pointer; border-bottom: 2px solid transparent;
  font-family: inherit; transition: color .2s, border-color .2s;
}
.cm-tab.active { color: #ff7f27; border-bottom-color: #ff7f27; }
.cm-tab:hover:not(.active) { color: #aaa; }

.cm-body { flex: 1; overflow-y: auto; padding: 8px 0; }
.cm-body::-webkit-scrollbar { width: 3px; }
.cm-body::-webkit-scrollbar-thumb { background: rgba(255,127,39,.2); border-radius: 2px; }

.cm-section-title {
  font-size: 9px; letter-spacing: 2px; color: #444;
  padding: 10px 14px 4px; text-transform: uppercase; font-weight: 700;
}

.cm-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; cursor: pointer;
  transition: background .15s; position: relative;
  border-left: 2px solid transparent;
}
.cm-item:hover { background: rgba(255,127,39,.05); }
.cm-item.active {
  background: rgba(255,127,39,.1);
  border-left-color: #ff7f27;
}
.cm-item-icon { font-size: 14px; flex-shrink: 0; width: 20px; text-align: center; }
.cm-item-body { flex: 1; overflow: hidden; }
.cm-item-title {
  font-size: 12px; font-weight: 600; color: #ddd;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cm-item.active .cm-item-title { color: #fff; }
.cm-item-preview {
  font-size: 10px; color: #555;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 2px;
}
.cm-item-meta {
  font-size: 9px; color: #444; flex-shrink: 0;
  display: flex; flex-direction: column; align-items: flex-end; gap: 3px;
}
.cm-item-actions {
  display: none; gap: 4px; position: absolute; right: 10px;
}
.cm-item:hover .cm-item-actions { display: flex; }
.cm-item-actions button {
  width: 22px; height: 22px; border-radius: 4px; border: none;
  background: rgba(255,127,39,.15); color: #ff7f27;
  cursor: pointer; font-size: 11px; display: flex;
  align-items: center; justify-content: center;
  transition: background .15s;
}
.cm-item-actions button:hover { background: rgba(255,127,39,.35); }
.cm-item-actions button.fav.active { color: #E6A400; background: rgba(230,164,0,.15); }
.cm-item-actions button.del { color: #E60000; }
.cm-item-actions button.del:hover { background: rgba(230,0,0,.2); }

.cm-badge {
  display: inline-block; min-width: 18px; height: 18px;
  padding: 0 5px; border-radius: 9px;
  background: rgba(255,127,39,.2); color: #ff7f27;
  font-size: 9px; font-weight: 700; text-align: center;
  line-height: 18px; letter-spacing: 0;
}

.cm-project-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; cursor: pointer;
  transition: background .15s;
}
.cm-project-item:hover { background: rgba(255,255,255,.04); }
.cm-project-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.cm-project-name { font-size: 12px; color: #ccc; flex: 1; }
.cm-project-count { font-size: 10px; color: #555; }

.cm-empty {
  text-align: center; padding: 32px 16px;
  font-size: 11px; color: #444; line-height: 1.8;
}

.cm-footer {
  padding: 12px 14px;
  border-top: 1px solid rgba(255,127,39,.12);
  font-size: 10px; color: #444; letter-spacing: 1px;
}

#cm-toggle {
  position: fixed; top: 16px; left: 16px; z-index: 1001;
  width: 40px; height: 40px; border-radius: 10px;
  background: #111; border: 1px solid rgba(255,127,39,.25);
  color: #ff7f27; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .2s;
  font-size: 16px;
}
#cm-toggle:hover { border-color: #ff7f27; background: rgba(255,127,39,.1); }

.cm-warning {
  margin: 8px 12px; padding: 8px 12px; border-radius: 6px;
  background: rgba(230,164,0,.1); border: 1px solid rgba(230,164,0,.3);
  font-size: 10px; color: #E6A400; line-height: 1.6;
}
`;

export class ConversationSidebar {
  constructor(manager) {
    this.cm = manager;
    this.activeTab = 'chats';
    this._build();
    this._bind();
  }

  _build() {
    if (!document.getElementById('cm-styles')) {
      const s = document.createElement('style');
      s.id = 'cm-styles'; s.textContent = SIDEBAR_CSS;
      document.head.appendChild(s);
    }

    const ov = document.createElement('div');
    ov.id = 'cm-overlay';
    ov.onclick = () => this.close();
    document.body.appendChild(ov);
    this.overlay = ov;

    const tog = document.createElement('button');
    tog.id = 'cm-toggle'; tog.title = 'Conversations';
    tog.innerHTML = '☰';
    tog.onclick = () => this.toggle();
    document.body.appendChild(tog);

    const sb = document.createElement('div');
    sb.id = 'cm-sidebar';
    sb.innerHTML = `
      <div class="cm-head">
        <span class="cm-logo">TI-LEX V10</span>
        <button class="cm-new-btn" id="cm-new">+ Nouveau</button>
      </div>
      <div class="cm-tabs">
        <button class="cm-tab active" data-tab="chats">Chat</button>
        <button class="cm-tab" data-tab="convs">Convs</button>
        <button class="cm-tab" data-tab="favs">Favoris</button>
        <button class="cm-tab" data-tab="projects">Projets</button>
      </div>
      <div class="cm-body" id="cm-body"></div>
      <div class="cm-footer" id="cm-footer">ti-lex-AL V10 · Loi 25</div>
    `;
    document.body.appendChild(sb);
    this.sidebar = sb;
    this.body    = sb.querySelector('#cm-body');
    this.footer  = sb.querySelector('#cm-footer');

    this.render();
  }

  _bind() {
    document.getElementById('cm-new').onclick = () => this._newConv();

    this.sidebar.querySelectorAll('.cm-tab').forEach(btn => {
      btn.onclick = () => {
        this.activeTab = btn.dataset.tab;
        this.sidebar.querySelectorAll('.cm-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.render();
      };
    });

    this.cm
      .on('load',    () => this.render())
      .on('new',     () => this.render())
      .on('rename',  () => this.render())
      .on('favorite',() => this.render())
      .on('delete',  () => this.render())
      .on('move',    () => this.render())
      .on('project-new',    () => this.render())
      .on('project-delete', () => this.render())
      .on('active',  () => this.render());
  }

  render() {
    const body = this.body;
    body.innerHTML = '';

    if (this.cm.conversations.length > 40) {
      const w = document.createElement('div');
      w.className = 'cm-warning';
      w.innerHTML = `⚠️ ${this.cm.conversations.length} conversations ouvertes.<br>Supprime les anciennes pour eviter les lags.`;
      body.appendChild(w);
    }

    switch (this.activeTab) {
      case 'chats':    this._renderChats(); break;
      case 'convs':    this._renderAll();   break;
      case 'favs':     this._renderFavs();  break;
      case 'projects': this._renderProjs(); break;
    }

    const nf = this.cm.conversations.length;
    this.footer.textContent = `${nf} conversation${nf !== 1 ? 's' : ''} · ti-lex-AL V10`;
  }

  _renderChats() {
    const recents = this.cm.recents.slice(0, 15);
    if (!recents.length) {
      this._empty('Aucune conversation.\nClique « + Nouveau » pour commencer.');
      return;
    }
    const t = document.createElement('div');
    t.className = 'cm-section-title'; t.textContent = 'RÉCENTES';
    this.body.appendChild(t);
    recents.forEach(c => this.body.appendChild(this._itemEl(c)));
  }

  _renderAll() {
    const all = this.cm.conversations;
    if (!all.length) { this._empty('Aucune conversation encore.'); return; }

    const t = document.createElement('div');
    t.className = 'cm-section-title';
    t.innerHTML = `TOUTES <span class="cm-badge">${all.length}</span>`;
    this.body.appendChild(t);
    all.forEach(c => this.body.appendChild(this._itemEl(c)));
  }

  _renderFavs() {
    const favs = this.cm.favorites;
    if (!favs.length) {
      this._empty('Aucun favori.\nClique ⭐ sur une conversation pour la mettre en favoris.');
      return;
    }
    const t = document.createElement('div');
    t.className = 'cm-section-title';
    t.innerHTML = `FAVORIS <span class="cm-badge">${favs.length}</span>`;
    this.body.appendChild(t);
    favs.forEach(c => this.body.appendChild(this._itemEl(c)));
  }

  _renderProjs() {
    if (!this.cm.projects.length) {
      this._empty('Aucun projet.\nClique « + Projet » pour regrouper tes conversations.');
    } else {
      const t = document.createElement('div');
      t.className = 'cm-section-title'; t.textContent = 'MES PROJETS';
      this.body.appendChild(t);
      this.cm.projects.forEach(p => this.body.appendChild(this._projEl(p)));
    }

    const btn = document.createElement('button');
    btn.style.cssText = 'width:calc(100% - 24px);margin:12px;padding:10px;border-radius:6px;background:transparent;border:1px dashed rgba(255,127,39,.3);color:#ff7f27;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;';
    btn.textContent = '+ NOUVEAU PROJET';
    btn.onclick = () => this._newProj();
    this.body.appendChild(btn);
  }

  _itemEl(conv) {
    const d = document.createElement('div');
    d.className = 'cm-item' + (conv.id === this.cm.activeId ? ' active' : '');
    const date = new Date(conv.last_msg_at);
    const dateStr = date.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
    d.innerHTML = `
      <div class="cm-item-icon">${conv.is_favorite ? '⭐' : '💬'}</div>
      <div class="cm-item-body">
        <div class="cm-item-title">${this._esc(conv.title)}</div>
        ${conv.preview ? `<div class="cm-item-preview">${this._esc(conv.preview)}</div>` : ''}
      </div>
      <div class="cm-item-meta">
        <span>${dateStr}</span>
        ${conv.message_count > 0 ? `<span class="cm-badge">${conv.message_count}</span>` : ''}
      </div>
      <div class="cm-item-actions">
        <button class="fav${conv.is_favorite ? ' active' : ''}" title="Favori">⭐</button>
        <button class="ren" title="Renommer">✏️</button>
        <button class="del" title="Supprimer">🗑</button>
      </div>`;

    d.onclick = () => { this.cm.setActive(conv.id); this.close(); };
    d.querySelector('.fav').onclick = e => { e.stopPropagation(); this.cm.toggleFavorite(conv.id); };
    d.querySelector('.ren').onclick = e => {
      e.stopPropagation();
      const t = prompt('Nouveau nom :', conv.title);
      if (t && t.trim()) this.cm.rename(conv.id, t.trim());
    };
    d.querySelector('.del').onclick = e => {
      e.stopPropagation();
      if (confirm(`Supprimer « ${conv.title} »?`)) this.cm.delete(conv.id);
    };
    return d;
  }

  _projEl(proj) {
    const d = document.createElement('div');
    d.className = 'cm-project-item';
    const count = this.cm.byProject(proj.id).length;
    d.innerHTML = `
      <div class="cm-project-dot" style="background:${proj.color}"></div>
      <span class="cm-project-name">${proj.icon} ${this._esc(proj.name)}</span>
      <span class="cm-project-count">${count} conv.</span>`;
    return d;
  }

  _empty(msg) {
    const d = document.createElement('div');
    d.className = 'cm-empty'; d.textContent = msg;
    this.body.appendChild(d);
  }

  _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async _newConv() {
    const title = prompt('Titre de la conversation (laisser vide = auto):') || 'Nouvelle conversation';
    await this.cm.newConversation(title);
    this.activeTab = 'chats';
    this.sidebar.querySelectorAll('.cm-tab').forEach(b => b.classList.remove('active'));
    this.sidebar.querySelector('[data-tab="chats"]').classList.add('active');
    this.render();
  }

  async _newProj() {
    const name = prompt('Nom du projet :');
    if (!name?.trim()) return;
    await this.cm.newProject(name.trim());
  }

  open()   { this.sidebar.classList.add('open');  this.overlay.classList.add('show'); }
  close()  { this.sidebar.classList.remove('open'); this.overlay.classList.remove('show'); }
  toggle() { this.sidebar.classList.contains('open') ? this.close() : this.open(); }
}
