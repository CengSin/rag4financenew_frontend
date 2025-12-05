const questionInput = document.getElementById('question');
const statusEl = document.getElementById('status');
const answerEl = document.getElementById('answer');
const submitBtn = document.getElementById('submit-btn');
const newSessionBtn = document.getElementById('new-session');
const historyList = document.getElementById('history-list');
const sessionPill = document.getElementById('session-pill');
const sessionTitle = document.getElementById('session-title');

const ENDPOINT = 'http://localhost:8081/ai/new/session';

let conversations = [];
let activeConversationId = null;
let conversationCount = 0;

function setStatus(text, type = 'muted') {
  statusEl.textContent = text;
  statusEl.style.color = type === 'error' ? 'var(--danger)' : 'var(--muted)';
}

function updateSessionMeta(conversation) {
  const sessionId = conversation?.sessionId;
  sessionPill.textContent = sessionId ? `会话：${sessionId}` : '未创建会话';
  sessionTitle.textContent = conversation?.title || '未创建会话';
}

function renderEmptyChat() {
  answerEl.innerHTML = `
    <div class="empty-chat">
      <p class="muted">开始新的对话，输入问题并回车发送。</p>
    </div>
  `;
}

function renderMessages(conversation, showTyping = false) {
  answerEl.innerHTML = '';
  if (!conversation || (!conversation.messages.length && !showTyping)) {
    renderEmptyChat();
    return;
  }

  conversation.messages.forEach((msg) => {
    const row = document.createElement('div');
    row.className = `chat-row ${msg.role === 'ai' ? 'ai' : 'user'}`;

    const bubble = document.createElement('div');
    bubble.className = `bubble ${msg.role === 'ai' ? 'ai' : 'user'}`;

    if (msg.role === 'ai') {
      bubble.innerHTML = marked.parse(msg.content || '', { breaks: true });
    } else {
      bubble.textContent = msg.content;
    }

    row.appendChild(bubble);
    answerEl.appendChild(row);
  });

  if (showTyping) {
    const aiRow = document.createElement('div');
    aiRow.className = 'chat-row ai';
    const aiBubble = document.createElement('div');
    aiBubble.className = 'bubble ai typing';
    aiBubble.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    aiRow.appendChild(aiBubble);
    answerEl.appendChild(aiRow);
  }
}

function addMessage(conversation, role, content) {
  conversation.messages.push({ role, content });
}

function summarize(text) {
  if (!text) return '新对话';
  return text.length > 30 ? `${text.slice(0, 28)}...` : text;
}

function renderHistory() {
  historyList.innerHTML = '';

  if (!conversations.length) {
    historyList.innerHTML = '<p class="muted empty">暂无历史对话</p>';
    return;
  }

  conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = `history-item${conv.id === activeConversationId ? ' active' : ''}`;

    const title = document.createElement('p');
    title.className = 'history-title';
    title.textContent = conv.title;

    const meta = document.createElement('p');
    meta.className = 'history-meta';
    const last = conv.messages[conv.messages.length - 1];
    meta.textContent = last ? summarize(last.content) : '尚未提问';

    item.appendChild(title);
    item.appendChild(meta);
    item.addEventListener('click', () => setActiveConversation(conv.id));
    historyList.appendChild(item);
  });
}

function getActiveConversation() {
  return conversations.find((conv) => conv.id === activeConversationId);
}

function setActiveConversation(id) {
  const conv = conversations.find((item) => item.id === id);
  if (!conv) return;
  activeConversationId = id;
  renderHistory();
  renderMessages(conv);
  updateSessionMeta(conv);
  setStatus(conv.messages.length ? '已切换到该对话' : '等待提交');
}

function refreshConversationTitle(conversation) {
  if (conversation.messages.length) {
    const firstUserMsg = conversation.messages.find((msg) => msg.role === 'user');
    if (firstUserMsg) {
      conversation.title = summarize(firstUserMsg.content);
    }
  } else {
    conversation.title = `新对话 ${conversationCount}`;
  }
}

function createConversation(silent = false) {
  const conversation = {
    id: `conv-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    title: `新对话 ${++conversationCount}`,
    sessionId: null,
    messages: [],
  };
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  renderHistory();
  renderMessages(conversation);
  updateSessionMeta(conversation);
  if (!silent) setStatus('已创建新聊天');
  return conversation;
}

function ensureConversation() {
  return getActiveConversation() || createConversation(true);
}

async function sendMessage() {
  const question = questionInput.value.trim();
  if (!question || submitBtn.disabled) return;

  const conversation = ensureConversation();
  submitBtn.disabled = true;
  questionInput.value = '';
  addMessage(conversation, 'user', question);
  refreshConversationTitle(conversation);
  renderHistory();
  renderMessages(conversation, true);
  updateSessionMeta(conversation);
  setStatus('正在请求接口...');

  const payload = { question };
  if (conversation.sessionId) {
    payload.session_id = conversation.sessionId;
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`接口返回 ${response.status}`);
    }

    const data = await response.json();
    conversation.sessionId = data.session_id || conversation.sessionId;
    addMessage(conversation, 'ai', data.reply_message || '未返回 reply_message 字段');
    renderMessages(conversation);
    renderHistory();
    updateSessionMeta(conversation);
    setStatus('请求完成');
  } catch (error) {
    console.error(error);
    addMessage(conversation, 'ai', '请求失败，请检查服务是否已启动。');
    renderMessages(conversation);
    setStatus(error.message || '请求失败', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

function handleKeydown(event) {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

createConversation(true);

newSessionBtn.addEventListener('click', () => {
  createConversation();
  setStatus('等待提交');
});

submitBtn.addEventListener('click', sendMessage);
questionInput.addEventListener('keydown', handleKeydown);
questionInput.addEventListener('input', () => setStatus('等待提交'));
