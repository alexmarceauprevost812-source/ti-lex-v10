// ============================================================
// TI-LEX-V10 SECURITY ENGINE
// Moteur de sécurité multi-couches pour agent IA
// ============================================================

// ============================================================
// 1. CORE SECURITY ENGINE - Moteur principal
// ============================================================

class TiLexSecurityEngine {
  constructor(config = {}) {
    this.config = {
      securityMode: config.securityMode || 'strict',
      sandboxType: config.sandboxType || 'docker',
      auditEnabled: config.auditEnabled !== false,
      hitlEnabled: config.hitlEnabled !== false,
      rateLimitEnabled: config.rateLimitEnabled !== false,
      guardrailsEnabled: config.guardrailsEnabled !== false,
      ...config
    };

    this.modules = {
      inputValidator: new InputValidator(),
      promptGuard: new PromptGuard(),
      sandboxManager: new SandboxManager(this.config.sandboxType),
      permissionManager: new PermissionManager(),
      auditLogger: new AuditLogger(),
      rateLimiter: new RateLimiter(),
      outputGuard: new OutputGuard(),
      hitlManager: new HITLManager(),
      identityManager: new IdentityManager(),
      threatDetector: new ThreatDetector()
    };

    this.state = {
      initialized: false,
      activeSessions: new Map(),
      blockedCount: 0,
      lastThreat: null
    };
  }

  async initialize() {
    await this.modules.sandboxManager.initialize();
    await this.modules.auditLogger.initialize();
    await this.modules.identityManager.initialize();
    this.state.initialized = true;
    console.log('[TiLex-SEC] Security engine initialized in', this.config.securityMode, 'mode');
  }

  // ============================================================
  // 2. INPUT VALIDATION - Couche 1
  // ============================================================

  async validateInput(input, context = {}) {
    const sessionId = context.sessionId || this.generateSessionId();

    const syntaxResult = await this.modules.inputValidator.validateSyntax(input);
    if (!syntaxResult.valid) {
      await this.blockRequest(sessionId, 'SYNTAX_VIOLATION', syntaxResult.reason);
      return { allowed: false, reason: syntaxResult.reason };
    }

    const injectionResult = await this.modules.promptGuard.detectInjection(input);
    if (injectionResult.detected) {
      await this.blockRequest(sessionId, 'PROMPT_INJECTION', injectionResult.details);
      return { allowed: false, reason: 'Potential prompt injection detected' };
    }

    const tokenResult = await this.modules.inputValidator.detectUnusualTokens(input);
    if (tokenResult.suspicious) {
      await this.logThreat(sessionId, 'UNUSUAL_TOKENS', tokenResult);
    }

    const lengthResult = this.modules.inputValidator.validateLength(input);
    if (!lengthResult.valid) {
      await this.blockRequest(sessionId, 'LENGTH_VIOLATION', lengthResult);
      return { allowed: false, reason: lengthResult.reason };
    }

    const contextResult = await this.modules.promptGuard.checkContext(sessionId, input);
    if (contextResult.suspicious) {
      await this.logThreat(sessionId, 'SUSPICIOUS_CONTEXT', contextResult);
    }

    return { allowed: true, sessionId, sanitized: syntaxResult.sanitized };
  }

  // ============================================================
  // 3. PERMISSION GATING - Couche 2
  // ============================================================

  async checkPermission(action, context = {}) {
    const { sessionId, userId, toolName, parameters } = context;

    const identity = await this.modules.identityManager.getIdentity(sessionId);
    if (!identity || identity.revoked) {
      await this.blockRequest(sessionId, 'INVALID_IDENTITY', { identity });
      return { allowed: false, reason: 'Invalid or revoked identity' };
    }

    const permResult = await this.modules.permissionManager.checkPermission(
      identity, action, toolName, parameters
    );
    if (!permResult.allowed) {
      await this.blockRequest(sessionId, 'PERMISSION_DENIED', permResult);
      return { allowed: false, reason: permResult.reason };
    }

    if (this.config.rateLimitEnabled) {
      const rateResult = await this.modules.rateLimiter.checkLimit(identity, action);
      if (!rateResult.allowed) {
        await this.blockRequest(sessionId, 'RATE_LIMIT', rateResult);
        return { allowed: false, reason: 'Rate limit exceeded' };
      }
    }

    if (this.config.hitlEnabled && this.isSensitiveAction(action, toolName)) {
      const hitlResult = await this.modules.hitlManager.requestApproval(sessionId, action, context);
      if (!hitlResult.approved) {
        await this.blockRequest(sessionId, 'HITL_DENIED', hitlResult);
        return { allowed: false, reason: 'Human approval required but not granted' };
      }
    }

    return { allowed: true, identity, permissions: permResult.granted };
  }

  // ============================================================
  // 4. SANDBOX EXECUTION - Couche 3
  // ============================================================

  async executeInSandbox(code, context = {}) {
    const { sessionId, timeout = 30000, memoryLimit = '512m' } = context;

    const sandbox = await this.modules.sandboxManager.createSandbox({
      sessionId,
      timeout,
      memoryLimit,
      network: false,
      filesystem: 'ephemeral',
      capabilities: []
    });

    await this.modules.auditLogger.log({
      type: 'SANDBOX_EXECUTION',
      sessionId,
      sandboxId: sandbox.id,
      code: this.hashCode(code),
      timestamp: Date.now()
    });

    try {
      const result = await sandbox.execute(code);

      const outputValidation = await this.modules.outputGuard.validate(result.output);
      if (!outputValidation.safe) {
        await this.blockRequest(sessionId, 'UNSAFE_OUTPUT', outputValidation);
        return { success: false, reason: 'Unsafe output detected' };
      }

      return { success: true, result: outputValidation.sanitized };
    } catch (error) {
      await this.modules.auditLogger.log({
        type: 'SANDBOX_ERROR',
        sessionId,
        error: error.message,
        timestamp: Date.now()
      });
      return { success: false, reason: error.message };
    } finally {
      await this.modules.sandboxManager.destroySandbox(sandbox.id);
    }
  }

  // ============================================================
  // 5. OUTPUT GUARDRAILS - Couche 4
  // ============================================================

  async validateOutput(output, context = {}) {
    const { sessionId, intendedUse } = context;

    const sensitiveResult = await this.modules.outputGuard.detectSensitive(output);
    if (sensitiveResult.found) {
      await this.logThreat(sessionId, 'SENSITIVE_OUTPUT', sensitiveResult);
    }

    const formatResult = this.modules.outputGuard.validateFormat(output, intendedUse);
    if (!formatResult.valid) {
      await this.blockRequest(sessionId, 'FORMAT_VIOLATION', formatResult);
      return { allowed: false, reason: formatResult.reason };
    }

    const coherenceResult = await this.modules.outputGuard.checkCoherence(output);
    if (!coherenceResult.coherent) {
      await this.logThreat(sessionId, 'INCOHERENT_OUTPUT', coherenceResult);
    }

    return { allowed: true, output: formatResult.sanitized };
  }

  // ============================================================
  // 6. THREAT DETECTION & RESPONSE
  // ============================================================

  async detectThreats(context = {}) {
    const { sessionId, behavior } = context;

    const behaviorAnalysis = await this.modules.threatDetector.analyzeBehavior(sessionId, behavior);

    if (behaviorAnalysis.anomalyScore > 0.8) {
      await this.triggerIncidentResponse(sessionId, 'HIGH_ANOMALY', behaviorAnalysis);
      return { threat: true, level: 'HIGH', details: behaviorAnalysis };
    }

    if (behaviorAnalysis.privilegeEscalation) {
      await this.triggerIncidentResponse(sessionId, 'PRIVILEGE_ESCALATION', behaviorAnalysis);
      return { threat: true, level: 'CRITICAL', details: behaviorAnalysis };
    }

    return { threat: false, score: behaviorAnalysis.anomalyScore };
  }

  async triggerIncidentResponse(sessionId, type, details) {
    await this.modules.identityManager.revokeSession(sessionId);

    await this.modules.auditLogger.log({
      type: 'INCIDENT',
      severity: type === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      sessionId,
      details,
      timestamp: Date.now()
    });

    await this.notifySecurityTeam(type, details);

    this.state.lastThreat = { sessionId, type, timestamp: Date.now() };
    this.state.blockedCount++;
  }

  // ============================================================
  // 7. UTILITAIRES
  // ============================================================

  generateSessionId() {
    return 'sess_' + crypto.randomUUID();
  }

  hashCode(code) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
  }

  isSensitiveAction(action, toolName) {
    const sensitiveTools = [
      'file_delete', 'database_write', 'api_call_external',
      'shell_execute', 'network_request', 'payment_process',
      'user_modify', 'config_change', 'model_update'
    ];
    return sensitiveTools.includes(toolName) || action.includes('DELETE') || action.includes('WRITE');
  }

  async blockRequest(sessionId, reason, details) {
    this.state.blockedCount++;
    await this.modules.auditLogger.log({
      type: 'BLOCKED',
      sessionId,
      reason,
      details,
      timestamp: Date.now()
    });
  }

  async logThreat(sessionId, type, details) {
    await this.modules.auditLogger.log({
      type: 'THREAT',
      sessionId,
      threatType: type,
      details,
      timestamp: Date.now()
    });
  }

  async notifySecurityTeam(type, details) {
    console.error(`[SECURITY ALERT] ${type}:`, details);
  }

  getStats() {
    return {
      blockedCount: this.state.blockedCount,
      activeSessions: this.state.activeSessions.size,
      lastThreat: this.state.lastThreat,
      mode: this.config.securityMode
    };
  }
}

// ============================================================
// 8. MODULES INDIVIDUELS
// ============================================================

class InputValidator {
  constructor() {
    this.blockedPatterns = [
      /ignore\s+previous\s+instructions/gi,
      /disregard\s+.*above/gi,
      /bypass\s+.*restrictions/gi,
      /system\s+override/gi,
      /you\s+are\s+now\s+.*/gi,
      /forget\s+.*instructions/gi,
      /new\s+role\s*:\s*/gi
    ];
    this.maxLength = 10000;
    this.maxSpecialCharRatio = 0.3;
  }

  validateSyntax(input) {
    if (typeof input !== 'string') {
      return { valid: false, reason: 'Input must be a string' };
    }
    const sanitized = input.replace(/[--]/g, '').trim();
    return { valid: true, sanitized };
  }

  detectUnusualTokens(input) {
    const specialChars = input.match(/[^a-zA-Z0-9\s]/g) || [];
    const ratio = specialChars.length / input.length;
    return {
      suspicious: ratio > this.maxSpecialCharRatio,
      ratio,
      specialCharCount: specialChars.length
    };
  }

  validateLength(input) {
    if (input.length > this.maxLength) {
      return { valid: false, reason: `Input exceeds ${this.maxLength} characters` };
    }
    return { valid: true, length: input.length };
  }
}

class PromptGuard {
  constructor() {
    this.contextMemory = new Map();
    this.maxContextLength = 10;
  }

  async detectInjection(input) {
    const patterns = [
      { pattern: /ignore\s+previous/gi, severity: 'HIGH' },
      { pattern: /system\s*:\s*/gi, severity: 'HIGH' },
      { pattern: /\[\s*system\s*\]/gi, severity: 'HIGH' },
      { pattern: /<\s*system\s*>/gi, severity: 'HIGH' },
      { pattern: /\{\s*system\s*\}/gi, severity: 'HIGH' },
      { pattern: /you\s+are\s+now\s+in\s+developer\s+mode/gi, severity: 'CRITICAL' },
      { pattern: /DAN\s*\(|do\s+anything\s+now/gi, severity: 'CRITICAL' }
    ];

    for (const { pattern, severity } of patterns) {
      if (pattern.test(input)) {
        return { detected: true, severity, pattern: pattern.toString() };
      }
    }

    const decoded = this.decodePotentialEncoding(input);
    if (decoded !== input) {
      const recheck = await this.detectInjection(decoded);
      if (recheck.detected) {
        return { detected: true, severity: 'HIGH', encoding: true };
      }
    }

    return { detected: false };
  }

  decodePotentialEncoding(input) {
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(input) && input.length % 4 === 0) {
      try { return atob(input); } catch (e) { /* not base64 */ }
    }
    if (input.includes('%')) {
      try { return decodeURIComponent(input); } catch (e) { /* not URL encoded */ }
    }
    return input;
  }

  async checkContext(sessionId, input) {
    const history = this.contextMemory.get(sessionId) || [];

    const suspiciousPatterns = [
      'helpful', 'friendly', 'trust', 'secret', 'password',
      'ignore', 'bypass', 'override', 'system'
    ];

    const recentInputs = history.slice(-5).map(h => h.input.toLowerCase());
    const trustBuilding = suspiciousPatterns.filter(p =>
      recentInputs.some(i => i.includes(p))
    ).length;

    history.push({ input, timestamp: Date.now() });
    if (history.length > this.maxContextLength) history.shift();
    this.contextMemory.set(sessionId, history);

    return {
      suspicious: trustBuilding >= 3,
      trustBuildingScore: trustBuilding,
      sessionLength: history.length
    };
  }
}

class SandboxManager {
  constructor(type) {
    this.type = type;
    this.activeSandboxes = new Map();
  }

  async initialize() {
    console.log(`[Sandbox] Initializing ${this.type} sandbox manager`);
  }

  async createSandbox(options) {
    const sandboxId = `sandbox_${crypto.randomUUID()}`;

    const config = {
      id: sandboxId,
      type: this.type,
      created: Date.now(),
      timeout: options.timeout || 30000,
      memoryLimit: options.memoryLimit || '512m',
      network: options.network || false,
      filesystem: options.filesystem || 'ephemeral',
      capabilities: options.capabilities || [],
      ...options
    };

    this.activeSandboxes.set(sandboxId, config);
    await this.spawnSandbox(config);

    return {
      id: sandboxId,
      execute: async (code) => this.executeInSandbox(sandboxId, code),
      destroy: async () => this.destroySandbox(sandboxId)
    };
  }

  async spawnSandbox(config) {
    switch (this.type) {
      case 'docker':
        console.log(`[Docker] Spawning container ${config.id}`);
        break;
      case 'gvisor':
        console.log(`[gVisor] Spawning sandbox ${config.id}`);
        break;
      case 'microvm':
        console.log(`[MicroVM] Spawning VM ${config.id}`);
        break;
      default:
        console.log(`[None] Warning: No sandbox isolation for ${config.id}`);
    }
  }

  async executeInSandbox(sandboxId, code) {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) throw new Error('Sandbox not found');

    const startTime = Date.now();
    try {
      const result = await this.simulateExecution(code, sandbox);
      return { output: result, executionTime: Date.now() - startTime, sandboxId };
    } catch (error) {
      throw new Error(`Sandbox execution failed: ${error.message}`);
    }
  }

  async simulateExecution(code, sandbox) {
    return { status: 'completed', output: 'Execution result' };
  }

  async destroySandbox(sandboxId) {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (sandbox) {
      console.log(`[Sandbox] Destroying ${sandboxId}`);
      this.activeSandboxes.delete(sandboxId);
    }
  }
}

class PermissionManager {
  constructor() {
    this.roles = {
      'user': ['read', 'chat', 'search'],
      'agent': ['read', 'chat', 'search', 'file_read', 'api_call_internal'],
      'admin': ['*']
    };
    this.grantedPermissions = new Map();
  }

  async checkPermission(identity, action, toolName, parameters) {
    const role = identity.role || 'user';
    const allowedActions = this.roles[role] || [];

    if (!allowedActions.includes('*') && !allowedActions.includes(action)) {
      return { allowed: false, reason: `Action '${action}' not allowed for role '${role}'` };
    }

    if (parameters) {
      const paramCheck = this.validateParameters(toolName, parameters);
      if (!paramCheck.valid) {
        return { allowed: false, reason: paramCheck.reason };
      }
    }

    return { allowed: true, granted: allowedActions };
  }

  validateParameters(toolName, parameters) {
    const validators = {
      'file_read': (p) => {
        if (p.path && p.path.includes('..')) {
          return { valid: false, reason: 'Path traversal detected' };
        }
        return { valid: true };
      },
      'shell_execute': (p) => {
        const blockedCommands = ['rm -rf /', 'mkfs', 'dd if=/dev/zero', '>:'];
        if (p.command && blockedCommands.some(c => p.command.includes(c))) {
          return { valid: false, reason: 'Dangerous command blocked' };
        }
        return { valid: true };
      }
    };

    const validator = validators[toolName];
    if (validator) return validator(parameters);
    return { valid: true };
  }
}

class AuditLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 10000;
  }

  async initialize() {
    console.log('[Audit] Logger initialized');
  }

  async log(entry) {
    const logEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: entry.timestamp || Date.now()
    };

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs / 2);
    }

    await this.exportToSIEM(logEntry);
    console.log(`[Audit] ${entry.type}: ${entry.sessionId || 'system'}`);
  }

  async exportToSIEM(entry) {
    // Intégration avec SIEM externe (Splunk, ELK, Datadog)
  }

  getLogs(filter = {}) {
    return this.logs.filter(log => {
      if (filter.type && log.type !== filter.type) return false;
      if (filter.sessionId && log.sessionId !== filter.sessionId) return false;
      if (filter.since && log.timestamp < filter.since) return false;
      return true;
    });
  }
}

class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.limits = {
      'user': { requests: 100, window: 60000 },
      'agent': { requests: 500, window: 60000 },
      'admin': { requests: 1000, window: 60000 }
    };
  }

  async checkLimit(identity, action) {
    const key = `${identity.id}:${action}`;
    const limit = this.limits[identity.role] || this.limits['user'];

    const now = Date.now();
    const bucket = this.buckets.get(key) || { tokens: limit.requests, lastRefill: now };

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((elapsed / limit.window) * limit.requests);
    bucket.tokens = Math.min(limit.requests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return { allowed: false, retryAfter: limit.window - (now - bucket.lastRefill) };
    }

    bucket.tokens--;
    this.buckets.set(key, bucket);
    return { allowed: true, remaining: bucket.tokens };
  }
}

class OutputGuard {
  constructor() {
    this.sensitivePatterns = [
      /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g,
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g,
      /\d{3}-\d{2}-\d{4}/g,
      /password\s*[:=]\s*\S+/gi,
      /api[_-]?key\s*[:=]\s*\S+/gi,
      /secret\s*[:=]\s*\S+/gi
    ];
  }

  async validate(output) {
    for (const pattern of this.sensitivePatterns) {
      const matches = output.match(pattern);
      if (matches) {
        return { safe: false, reason: 'Sensitive data detected in output', matches };
      }
    }
    return { safe: true, sanitized: output };
  }

  async detectSensitive(output) {
    for (const pattern of this.sensitivePatterns) {
      if (pattern.test(output)) {
        return { found: true };
      }
    }
    return { found: false };
  }

  validateFormat(output, intendedUse) {
    const formatValidators = {
      'json': (o) => {
        try { JSON.parse(o); return { valid: true, sanitized: o }; }
        catch (e) { return { valid: false, reason: 'Invalid JSON' }; }
      },
      'html': (o) => {
        if (o.includes('<script>')) {
          return { valid: false, reason: 'HTML contains script tags' };
        }
        return { valid: true, sanitized: o.replace(/<script[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') };
      }
    };

    const validator = formatValidators[intendedUse];
    if (validator) return validator(output);
    return { valid: true, sanitized: output };
  }

  async checkCoherence(output) {
    const suspiciousPatterns = [
      /I\s+am\s+not\s+sure\s+but/gi,
      /I\s+think\s+it\s+might\s+be/gi,
      /possibly|maybe|perhaps.*\d{4}/gi
    ];

    const coherenceScore = suspiciousPatterns.reduce((score, pattern) => {
      return score + (pattern.test(output) ? 0.2 : 0);
    }, 1);

    return { coherent: coherenceScore > 0.7, score: coherenceScore };
  }
}

class HITLManager {
  constructor() {
    this.pendingApprovals = new Map();
    this.timeout = 300000;
  }

  async requestApproval(sessionId, action, context) {
    const approvalId = `approval_${crypto.randomUUID()}`;

    this.pendingApprovals.set(approvalId, {
      sessionId,
      action,
      context,
      requested: Date.now(),
      status: 'pending'
    });

    await this.notifyUser(approvalId, action, context);

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const approval = this.pendingApprovals.get(approvalId);

        if (!approval || Date.now() - approval.requested > this.timeout) {
          clearInterval(checkInterval);
          this.pendingApprovals.delete(approvalId);
          resolve({ approved: false, reason: 'Timeout' });
        }

        if (approval.status === 'approved') {
          clearInterval(checkInterval);
          this.pendingApprovals.delete(approvalId);
          resolve({ approved: true, approvedBy: approval.approvedBy });
        }

        if (approval.status === 'denied') {
          clearInterval(checkInterval);
          this.pendingApprovals.delete(approvalId);
          resolve({ approved: false, reason: 'Denied by user' });
        }
      }, 1000);
    });
  }

  async notifyUser(approvalId, action, context) {
    console.log(`[HITL] Approval required: ${approvalId}`);
    console.log(`  Action: ${action}`);
    console.log(`  Approve: POST /api/approvals/${approvalId}/approve`);
    console.log(`  Deny: POST /api/approvals/${approvalId}/deny`);
  }

  async approve(approvalId, userId) {
    const approval = this.pendingApprovals.get(approvalId);
    if (approval) {
      approval.status = 'approved';
      approval.approvedBy = userId;
    }
  }

  async deny(approvalId, userId) {
    const approval = this.pendingApprovals.get(approvalId);
    if (approval) {
      approval.status = 'denied';
      approval.deniedBy = userId;
    }
  }
}

class IdentityManager {
  constructor() {
    this.identities = new Map();
    this.sessions = new Map();
  }

  async initialize() {
    console.log('[Identity] Manager initialized');
  }

  async createIdentity(role = 'user', metadata = {}) {
    const identity = {
      id: crypto.randomUUID(),
      role,
      created: Date.now(),
      expires: Date.now() + 3600000,
      metadata,
      revoked: false
    };
    this.identities.set(identity.id, identity);
    return identity;
  }

  async getIdentity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const identity = this.identities.get(session.identityId);
    if (!identity || identity.revoked || identity.expires < Date.now()) return null;
    return identity;
  }

  async createSession(identityId) {
    const sessionId = `sess_${crypto.randomUUID()}`;
    this.sessions.set(sessionId, {
      identityId,
      created: Date.now(),
      lastActivity: Date.now()
    });
    return sessionId;
  }

  async revokeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const identity = this.identities.get(session.identityId);
      if (identity) identity.revoked = true;
      this.sessions.delete(sessionId);
    }
  }
}

class ThreatDetector {
  constructor() {
    this.behaviorHistory = new Map();
    this.baselineProfiles = new Map();
  }

  async analyzeBehavior(sessionId, behavior) {
    const history = this.behaviorHistory.get(sessionId) || [];
    history.push({ ...behavior, timestamp: Date.now() });
    if (history.length > 50) history.shift();
    this.behaviorHistory.set(sessionId, history);

    const anomalyScore = this.calculateAnomalyScore(history);
    const privilegeEscalation = this.detectPrivilegeEscalation(history);
    const dataExfiltration = this.detectDataExfiltration(history);

    return { anomalyScore, privilegeEscalation, dataExfiltration, historyLength: history.length };
  }

  calculateAnomalyScore(history) {
    if (history.length < 5) return 0;
    const recentActions = history.slice(-10);
    const uniqueActions = new Set(recentActions.map(a => a.action)).size;
    const actionFrequency = recentActions.length / 10;
    return Math.min(1, (uniqueActions / 5) * actionFrequency);
  }

  detectPrivilegeEscalation(history) {
    const sensitiveActions = ['role_change', 'permission_grant', 'config_admin'];
    const recentActions = history.slice(-5);
    return recentActions.some(a => sensitiveActions.includes(a.action));
  }

  detectDataExfiltration(history) {
    const recentActions = history.slice(-10);
    const readActions = recentActions.filter(a => a.action.includes('read')).length;
    const externalActions = recentActions.filter(a => a.action.includes('external')).length;
    return readActions > 5 && externalActions > 2;
  }
}

// ============================================================
// 9. INTEGRATION NEXT.JS
// ============================================================

const securityMiddleware = async (request) => {
  const engine = request.app?.securityEngine || global.tiLexSecurityEngine;
  if (!engine) {
    return new Response('Security engine not initialized', { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const validation = await engine.validateInput(body.prompt || body.message || '', {
    sessionId: request.headers.get('x-session-id')
  });

  if (!validation.allowed) {
    return new Response(JSON.stringify({ error: validation.reason }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  request.securityContext = validation;
  return null;
};

const secureApiHandler = (handler) => {
  return async (request, context) => {
    const engine = global.tiLexSecurityEngine;
    const body = await request.json();
    const action = body.action || 'chat';
    const toolName = body.tool;

    const permission = await engine.checkPermission(action, {
      sessionId: request.securityContext?.sessionId,
      userId: request.headers.get('x-user-id'),
      toolName,
      parameters: body.parameters
    });

    if (!permission.allowed) {
      return new Response(JSON.stringify({ error: permission.reason }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.code) {
      const sandboxResult = await engine.executeInSandbox(body.code, {
        sessionId: request.securityContext?.sessionId
      });
      if (!sandboxResult.success) {
        return new Response(JSON.stringify({ error: sandboxResult.reason }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      body.code = sandboxResult.result;
    }

    const result = await handler(request, context);
    const responseBody = await result.json();
    const outputValidation = await engine.validateOutput(responseBody.content || responseBody, {
      sessionId: request.securityContext?.sessionId,
      intendedUse: body.format || 'text'
    });

    if (!outputValidation.allowed) {
      return new Response(JSON.stringify({ error: outputValidation.reason }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(outputValidation.output), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
};

// ============================================================
// EXPORTS
// ============================================================

export {
  TiLexSecurityEngine,
  securityMiddleware,
  secureApiHandler,
  InputValidator,
  PromptGuard,
  SandboxManager,
  PermissionManager,
  AuditLogger,
  RateLimiter,
  OutputGuard,
  HITLManager,
  IdentityManager,
  ThreatDetector
};

export default TiLexSecurityEngine;
