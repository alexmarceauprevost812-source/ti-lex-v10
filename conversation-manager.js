// ti-lex v10 — Gestionnaire de conversations
// Vanilla JS · Supabase · conv_project_id pour lien conversation_projects

const CM_LIMIT = 50;

export class ConversationManager {
  constructor(supabaseClient, userId) {
    this.sb = supabaseClient;
    this.uid = userId;
    this.conversations = [];
    this.projects = [];
    this.activeId = null;
    this.listeners = {};
  }

  async load() {
    const [convRes, projRes] = await Promise.all([
      this.sb.from('conversations')
        .select('*')
        .eq('user_id', this.uid)
        .order('last_msg_at', { ascending: false })
        .limit(CM_LIMIT),
      this.sb.from('conversation_projects')
        .select('*')
        .eq('user_id', this.uid)
        .order('created_at', { ascending: true })
    ]);
    if (!convRes.error) this.conversations = convRes.data || [];
    if (!projRes.error) this.projects      = projRes.data || [];
    this._emit('load');
    return this;
  }

  async newConversation(title, convProjectId = null) {
    const { data, error } = await this.sb.from('conversations')
      .insert({ user_id: this.uid, title: title || 'Nouvelle conversation', conv_project_id: convProjectId })
      .select().single();
    if (error) throw error;
    this.conversations.unshift(data);
    this.activeId = data.id;
    this._emit('new', data);
    return data;
  }

  async rename(id, title) {
    await this.sb.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', id);
    this._update(id, { title });
    this._emit('rename', { id, title });
  }

  async toggleFavorite(id) {
    const conv = this.conversations.find(c => c.id === id);
    if (!conv) return;
    const is_favorite = !conv.is_favorite;
    await this.sb.from('conversations').update({ is_favorite }).eq('id', id);
    this._update(id, { is_favorite });
    this._emit('favorite', { id, is_favorite });
  }

  async moveToProject(id, convProjectId) {
    await this.sb.from('conversations').update({ conv_project_id: convProjectId }).eq('id', id);
    this._update(id, { conv_project_id: convProjectId });
    this._emit('move', { id, convProjectId });
  }

  async delete(id) {
    await this.sb.from('conversations').delete().eq('id', id);
    this.conversations = this.conversations.filter(c => c.id !== id);
    if (this.activeId === id) this.activeId = this.conversations[0]?.id || null;
    this._emit('delete', id);
  }

  async newProject(name, icon = '📁', color = '#ff7f27') {
    const { data, error } = await this.sb.from('conversation_projects')
      .insert({ user_id: this.uid, name, icon, color }).select().single();
    if (error) throw error;
    this.projects.push(data);
    this._emit('project-new', data);
    return data;
  }

  async deleteProject(id) {
    await this.sb.from('conversations').update({ conv_project_id: null }).eq('conv_project_id', id);
    await this.sb.from('conversation_projects').delete().eq('id', id);
    this.projects = this.projects.filter(p => p.id !== id);
    this.conversations.forEach(c => { if (c.conv_project_id === id) c.conv_project_id = null; });
    this._emit('project-delete', id);
  }

  async purgeOldEmpty() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    await this.sb.from('conversations')
      .delete()
      .eq('user_id', this.uid)
      .eq('message_count', 0)
      .lt('created_at', cutoff.toISOString());
  }

  get favorites() { return this.conversations.filter(c => c.is_favorite); }
  get recents()   { return this.conversations.filter(c => !c.is_favorite); }
  byProject(pid)  { return this.conversations.filter(c => c.conv_project_id === pid); }
  get active()    { return this.conversations.find(c => c.id === this.activeId) || null; }

  setActive(id) {
    this.activeId = id;
    this._emit('active', id);
  }

  _update(id, patch) {
    const i = this.conversations.findIndex(c => c.id === id);
    if (i !== -1) Object.assign(this.conversations[i], patch);
  }
  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); return this; }
  _emit(evt, data) { (this.listeners[evt] || []).forEach(fn => fn(data)); }
}
