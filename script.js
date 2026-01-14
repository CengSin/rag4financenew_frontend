const questionInput = document.getElementById('question');
const statusEl = document.getElementById('status');
const answerEl = document.getElementById('answer');
const submitBtn = document.getElementById('submit-btn');
const newSessionBtn = document.getElementById('new-session');
const historyList = document.getElementById('history-list');
const sessionPill = document.getElementById('session-pill');
const sessionTitle = document.getElementById('session-title');

const ENDPOINT = 'http://localhost:8081/ai/new/session';
const LIST_ENDPOINT = 'http://localhost:8086/v2/session/list';
const HISTORY_ENDPOINT = 'http://localhost:8086/v2/session/history';

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

  // Scroll to bottom
  answerEl.scrollTop = answerEl.scrollHeight;
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

async function setActiveConversation(id) {
  const conv = conversations.find((item) => item.id === id);
  if (!conv) return;

  activeConversationId = id;

  // If it's a backend session and doesn't have messages yet, fetch them
  if (conv.sessionId && conv.messages.length === 0) {
    setStatus('正在获取对话详情...');
    try {
      const response = await fetch(`${HISTORY_ENDPOINT}?session_id=${conv.sessionId}`);
      if (response.ok) {
        const history = await response.json();
        conv.messages = history.map(item => ({
          role: item.role === 'assistant' ? 'ai' : 'user',
          content: item.content
        }));
        if (conv.messages.length > 0) {
          refreshConversationTitle(conv);
        }
      } else {
        throw new Error(`获取历史失败: ${response.status}`);
      }
    } catch (error) {
      console.error(error);
      setStatus('获取历史记录失败', 'error');
    }
  }

  renderHistory();
  renderMessages(conv);
  updateSessionMeta(conv);
  setStatus(conv.messages.length ? '已加载对话内容' : '等待提交');
}

async function fetchHistoryList() {
  setStatus('正在加载对话列表...');
  try {
    const response = await fetch(`${LIST_ENDPOINT}?cursor=0&limit=20`);
    if (!response.ok) throw new Error('网络请求错误');

    const data = await response.json();
    if (data.sessions && data.sessions.length > 0) {
      conversations = data.sessions.map(fullId => {
        // Strip prefix "chatHistory:" if present
        const sessionId = fullId.replace('chatHistory:', '');
        return {
          id: `backend-${sessionId}`,
          title: `对话 ${sessionId.slice(0, 8)}`,
          sessionId: sessionId,
          messages: [] // Will be lazy loaded
        };
      });
      // Set the first one as active if no active conversation or it's just the initial empty one
      if (conversations.length > 0) {
        await setActiveConversation(conversations[0].id);
      }
    }
  } catch (error) {
    console.error('Failed to fetch history list:', error);
    setStatus('加载列表失败', 'error');
  }
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
  // Clear input when creating new session
  questionInput.value = '';
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

// Initial load
fetchHistoryList();

newSessionBtn.addEventListener('click', () => {
  createConversation();
  setStatus('等待提交');
});

submitBtn.addEventListener('click', sendMessage);
questionInput.addEventListener('keydown', handleKeydown);
questionInput.addEventListener('input', () => setStatus('等待提交'));
