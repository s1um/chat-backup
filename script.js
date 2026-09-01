// ── 로그 종류 설정 ────────────────────────────────
const LOG_TYPES = {
    kakao: {
        label: '카카오톡',
        hint: `<b>형식:</b> [이름] [오전/오후 H:MM] 메시지<br>카카오톡 대화 내보내기 로그를 그대로 붙여넣으세요.`,
        regex: /^\[?(.+?)\]?\s+\[?(오전|오후)?\s*\d{1,2}:\d{2}\]?\s+(.+)$/
    },
    twitter: {
        label: '트위터 DM',
        hint: `<b>형식 A:</b> 이름 TAB 메시지 TAB 시간 (탭 구분)<br><b>형식 B:</b> [이름] → 메시지(여러 줄 가능) → 오전/오후 h:mm<br>타임스탬프가 발화자 구분 기준 — 타임스탬프마다 다음 발화자로 전환됩니다.`,
        regexTab:   /^(.+?)\t(.+?)(?:\t.+)?$/,
        timeRe:     /^(오전|오후)\s+\d{1,2}:\d{2}$/
    },
    twitter_mention: {
        label: '트위터 멘션',
        hint: `<b>형식:</b> 닉네임 → <code>@아이디</code> → · → 시간 → 내용<br>닉네임을 발화자로 인식하고 트위터(X) 스레드 형태로 표시합니다. 타임라인·멘션을 그대로 붙여넣으세요.`
    },
    band: {
        label: '밴드 채팅',
        hint: `<b>형식 A:</b> 이름(단독 줄) → 메시지 줄<br><b>형식 B:</b> <code>yyyy.mm.dd hh:mm 이름</code> → 메시지 줄<br>두 형식 모두 지원합니다.`,
        timeRe:     /\s*\d{1,2}:\d{2}$/,
        dateLineRe: /^\d{4}\.\d{2}\.\d{2}\s+\d{1,2}:\d{2}\s+(.+)$/
    },
    band_comment: {
        label: '밴드 댓글',
        hint: `<b>형식:</b> 이름 → 내용 <br>밴드 게시글 댓글을 그대로 긁어서 붙여넣으세요.<br>날짜를 기준으로 댓글 내용을 구분합니다.`
    }
};

let currentLogType = 'kakao';

// ── 상태 ──────────────────────────────────────────
let speakers = [
    { id: 0, name: "나",       color: "#6366f1", align: "flex-end",   name_color: null,      text_color: "#ffffff", avatar: null },
    { id: 1, name: "상대방 A", color: "#e5e7eb", align: "flex-start", name_color: "#6b7280", text_color: "#111827", show_name: true, avatar: null }
];
let nextSpeakerId = 2;

// ── DOM ──────────────────────────────────────────
const messagesContainer = document.getElementById('messages-container');
const emptyState        = document.getElementById('empty-state');
const speakerSelect     = document.getElementById('speaker-select');
const speakerChipList   = document.getElementById('speaker-chip-list');
const newNameInput      = document.getElementById('new-name-input');
const bubbleColorInput  = document.getElementById('bubble-color-input');
const textColorInput    = document.getElementById('text-color-input');
const nameColorInput    = document.getElementById('name-color-input');
const nameColorGroup    = document.getElementById('name-color-group');
const avatarPreview     = document.getElementById('avatar-preview');
const avatarUploadInput = document.getElementById('avatar-upload-input');
const messageInput      = document.getElementById('message-input');
const dynamicStyleTag   = document.getElementById('dynamic-styles');
const toastEl           = document.getElementById('toast');
const pngLoading        = document.getElementById('png-loading');
const logHint           = document.getElementById('log-hint');

// ── 토스트 ───────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// ── 로그 종류 탭 ─────────────────────────────────
function initLogTabs() {
    document.querySelectorAll('.log-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.log-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLogType = btn.dataset.type;
            updateLogHint();
            updateSpeakerChips();
        });
    });
    updateLogHint();
}
function currentRenderMode() {
    if (currentLogType === 'band_comment')    return 'comment';
    if (currentLogType === 'twitter_mention') return 'tweet';
    return 'bubble';
}
function updateLogHint() {
    logHint.innerHTML = LOG_TYPES[currentLogType].hint;
    const mode = currentRenderMode();
    const prev = messagesContainer.classList.contains('comment-mode') ? 'comment'
               : messagesContainer.classList.contains('tweet-mode')   ? 'tweet'
               : 'bubble';
    messagesContainer.classList.toggle('comment-mode', mode === 'comment');
    messagesContainer.classList.toggle('tweet-mode',   mode === 'tweet');
    if (prev !== mode) rebuildMessagesInCurrentMode();
}

// ── HSL → Hex 변환 (color input 호환) ───
function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const val = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(val * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function getAutoColor(index) {
    const hue = Math.round((index * 137.5) % 360);
    return {
        bg:   hslToHex(hue, 30, 88),
        name: hslToHex(hue, 45, 38)
    };
}

// ── 동적 스타일 ───────────────────────────────────
function updateDynamicStyles() {
    let css = '';
    for (const s of speakers) {
        css += `.speaker-${s.id} .comment-avatar { background-color: var(--speaker-${s.id}-bubble); }\n`;
        if (s.id === 0) {
            css += `
                .speaker-${s.id} { align-self: ${s.align}; background-color: var(--speaker-${s.id}-bubble); color: var(--speaker-${s.id}-text); }
                .speaker-${s.id}.is-last-message { border-bottom-right-radius: 3px; margin-bottom: 4px; }
            `;
        } else {
            css += `
                .speaker-${s.id} { align-self: ${s.align}; background-color: var(--speaker-${s.id}-bubble); color: var(--speaker-${s.id}-text); }
                .speaker-${s.id}.is-last-message { border-bottom-left-radius: 3px; margin-bottom: 0; }
                .header-for-speaker-${s.id} {
                    align-self: ${s.align};
                    color: var(--speaker-${s.id}-name);
                    font-size: 10px; font-weight: 600;
                    margin-left: 3px; margin-top: 2px; margin-bottom: 3px; letter-spacing: 0.2px;
                }
            `;
        }
    }
    dynamicStyleTag.innerHTML = css;
}

function applyCssVariables() {
    for (const s of speakers) {
        document.documentElement.style.setProperty(`--speaker-${s.id}-bubble`, s.color);
        document.documentElement.style.setProperty(`--speaker-${s.id}-text`, s.text_color || (s.id === 0 ? '#ffffff' : '#111827'));
        if (s.name_color) document.documentElement.style.setProperty(`--speaker-${s.id}-name`, s.name_color);
    }
}

// ── 발화자 칩 ─────────────────────────────────────
function updateSpeakerChips() {
    speakerChipList.innerHTML = '';
    const activeId = getCurrentSpeakerId();
    speakers.forEach(s => {
        const chip = document.createElement('div');
        chip.className = 'speaker-chip' + (s.id === activeId ? ' active' : '');
        chip.dataset.id = s.id;

        const dot = document.createElement('div');
        dot.className = 'chip-dot';
        if (s.avatar) {
            dot.style.backgroundImage = `url("${s.avatar}")`;
            dot.style.backgroundSize = 'cover';
            dot.style.backgroundPosition = 'center';
        } else {
            dot.style.background = s.color;
        }

        const name = document.createElement('div');
        name.className = 'chip-name';
        name.textContent = s.name;

        const tag = document.createElement('div');
        tag.className = 'chip-tag';
        tag.textContent = s.id === 0 ? '나' : '상대';

        chip.append(dot, name, tag);

        if (currentLogType === 'twitter_mention') {
            const handleToggle = document.createElement('button');
            const handleOn = s.show_handle !== false;
            handleToggle.className = 'chip-handle-toggle' + (handleOn ? '' : ' hidden');
            handleToggle.title = handleOn ? '아이디 숨기기' : '아이디 표시';
            handleToggle.textContent = '@';
            handleToggle.addEventListener('click', e => {
                e.stopPropagation();
                toggleSpeakerHandle(s.id);
            });
            chip.append(handleToggle);
        }

        if (s.id !== 0) {
            const toggle = document.createElement('button');
            toggle.className = 'chip-name-toggle' + (s.show_name ? '' : ' hidden');
            toggle.title = s.show_name ? '이름 숨기기' : '이름 표시';
            toggle.innerHTML = s.show_name
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            toggle.addEventListener('click', e => {
                e.stopPropagation();
                toggleSpeakerName(s.id);
            });

            const del = document.createElement('button');
            del.className = 'chip-del';
            del.title = '발화자 삭제';
            del.textContent = '×';
            del.addEventListener('click', e => {
                e.stopPropagation();
                deleteSpeaker(s.id);
            });
            chip.append(toggle, del);
        }

        chip.addEventListener('click', () => {
            speakerSelect.value = s.id;
            loadSpeakerSettings();
            updateSpeakerChips();
        });
        speakerChipList.appendChild(chip);
    });
}

function toggleSpeakerName(id) {
    const s = speakers.find(s => s.id === id);
    if (!s) return;
    s.show_name = !s.show_name;
    updateSpeakerChips();
    rebuildMessageHeaders();
}

function toggleSpeakerHandle(id) {
    const s = speakers.find(s => s.id === id);
    if (!s) return;
    const msgs = [...messagesContainer.querySelectorAll(`.message.speaker-${id}`)];
    if (msgs.length) {
        const anyShown = msgs.some(el => !el.classList.contains('hide-handle'));
        s.show_handle = !anyShown;
    } else {
        s.show_handle = s.show_handle === false;
    }
    msgs.forEach(el => el.classList.toggle('hide-handle', s.show_handle === false));
    updateSpeakerChips();
}

function deleteSpeaker(id) {
    speakers = speakers.filter(s => s.id !== id);
    document.documentElement.style.removeProperty(`--speaker-${id}-bubble`);
    document.documentElement.style.removeProperty(`--speaker-${id}-text`);
    document.documentElement.style.removeProperty(`--speaker-${id}-name`);
    updateDynamicStyles();
    applyCssVariables();
    if (getCurrentSpeakerId() === id) speakerSelect.value = speakers[0].id;
    updateSpeakerDropdown();
    showToast('발화자가 삭제되었습니다.');
}

// ── 드롭다운 ─────────────────────────────────────
function updateSpeakerDropdown() {
    const prevId = getCurrentSpeakerId();
    speakerSelect.innerHTML = '';
    speakers.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.name;
        speakerSelect.appendChild(opt);
    });
    if (speakers.find(s => s.id === prevId)) speakerSelect.value = prevId;
    loadSpeakerSettings();
    updateSpeakerChips();
}

function loadSpeakerSettings() {
    const id = getCurrentSpeakerId();
    const s  = speakers.find(s => s.id === id);
    if (!s) return;
    newNameInput.value     = s.name;
    bubbleColorInput.value = s.color;
    textColorInput.value   = s.text_color || (s.id === 0 ? '#ffffff' : '#111827');
    if (s.id === 0) {
        nameColorGroup.style.visibility = 'hidden';
    } else {
        nameColorGroup.style.visibility = 'visible';
        nameColorInput.value = s.name_color || '#6b7280';
    }
    updateAvatarPreview(s);
}

function updateAvatarPreview(s) {
    if (s.avatar) {
        avatarPreview.style.backgroundImage = `url("${s.avatar}")`;
        avatarPreview.style.backgroundColor = 'transparent';
    } else {
        avatarPreview.style.backgroundImage = 'none';
        avatarPreview.style.backgroundColor = s.color;
    }
}

// ── 프로필 사진 ───────────────────────────────────
function setSpeakerAvatar(id, dataUrl) {
    const s = speakers.find(s => s.id === id);
    if (!s) return;
    s.avatar = dataUrl;
    updateAvatarPreview(s);
    updateSpeakerChips();
    refreshAvatarDisplays(id);
}

function removeSpeakerAvatar() {
    const id = getCurrentSpeakerId();
    const s  = speakers.find(s => s.id === id);
    if (!s || !s.avatar) return;
    s.avatar = null;
    updateAvatarPreview(s);
    updateSpeakerChips();
    refreshAvatarDisplays(id);
    showToast('프로필 사진이 제거되었습니다.');
}

function refreshAvatarDisplays(id) {
    const s = speakers.find(s => s.id === id);
    if (!s) return;

    messagesContainer.querySelectorAll(`.header-for-speaker-${id}`).forEach(hdr => {
        let img = hdr.querySelector('.header-avatar');
        if (s.avatar) {
            if (!img) {
                img = document.createElement('img');
                img.className = 'header-avatar';
                img.alt = '';
                hdr.prepend(img);
            }
            img.src = s.avatar;
        } else if (img) {
            img.remove();
        }
    });

    messagesContainer.querySelectorAll(`.speaker-${id} .comment-avatar`).forEach(av => {
        let img = av.querySelector('img');
        if (s.avatar) {
            if (!img) {
                img = document.createElement('img');
                img.alt = '';
                av.appendChild(img);
            }
            img.src = s.avatar;
        } else if (img) {
            img.remove();
        }
    });
}

function updateSpeakerColor(type) {
    const id = getCurrentSpeakerId();
    const s  = speakers.find(s => s.id === id);
    if (!s) return;
    if (type === 'bubble') {
        s.color = bubbleColorInput.value;
        document.documentElement.style.setProperty(`--speaker-${id}-bubble`, s.color);
        updateSpeakerChips();
    } else if (type === 'text') {
        s.text_color = textColorInput.value;
        document.documentElement.style.setProperty(`--speaker-${id}-text`, s.text_color);
    } else if (type === 'name' && s.id !== 0) {
        s.name_color = nameColorInput.value;
        document.documentElement.style.setProperty(`--speaker-${id}-name`, s.name_color);
    }
}

function getCurrentSpeakerId() { return parseInt(speakerSelect.value, 10); }

// ── 발화자 추가 ───────────────────────────────────
function addSpeaker() {
    const newId  = nextSpeakerId++;
    const colors = getAutoColor(newId);
    const newS   = { id: newId, name: `상대방 ${speakers.length}`, color: colors.bg, align: 'flex-start', name_color: colors.name, text_color: '#111827', show_name: true, avatar: null };
    speakers.push(newS);
    updateDynamicStyles(); applyCssVariables();
    updateSpeakerDropdown();
    speakerSelect.value = newId;
    loadSpeakerSettings(); updateSpeakerChips();
    messageInput.focus();
    showToast(`"${newS.name}" 발화자가 추가되었습니다.`);
}

// ── 이름 변경 ─────────────────────────────────────
function changeSpeakerName() {
    const id   = getCurrentSpeakerId();
    const name = newNameInput.value.trim();
    if (!name) { showToast('새 이름을 입력해주세요.'); return; }
    const s = speakers.find(s => s.id === id);
    if (s) {
        s.name = name;
        updateSpeakerDropdown();
        speakerSelect.value = id;
        updateSpeakerChips();
        messageInput.focus();
        showToast(`이름이 "${name}"으로 변경되었습니다.`);
    }
}

// ── 전체 초기화 ──────────────────────────────────
function clearMessages() {
    if (!messagesContainer.querySelector('.message')) { showToast('삭제할 메시지가 없습니다.'); return; }
    if (!confirm('모든 메시지를 삭제할까요?')) return;
    Array.from(messagesContainer.children).forEach(el => {
        if (el.id !== 'empty-state') messagesContainer.removeChild(el);
    });
    syncEmptyState();
    showToast('모든 메시지가 초기화되었습니다.');
}

function syncEmptyState() {
    emptyState.style.display = messagesContainer.querySelector('.message') ? 'none' : 'flex';
}

// ── 메시지 DOM 생성 ───────────────────────────────
function isCommentMode() { return currentRenderMode() === 'comment'; }
function isTweetMode()   { return currentRenderMode() === 'tweet'; }

// ── 말풍선 ↔ 댓글 형식 전환 ───────────────────────
function extractMessagesData() {
    const data = [];
    messagesContainer.querySelectorAll('.message').forEach(msgEl => {
        const sc = [...msgEl.classList].find(c => /^speaker-\d+$/.test(c));
        if (!sc) return;
        const speakerId = parseInt(sc.replace('speaker-', ''), 10);
        const locked  = msgEl.classList.contains('msg-locked');
        const tweet   = {
            handle: msgEl.dataset.handle || '',
            time:   msgEl.dataset.time   || '',
            stats:  msgEl.dataset.stats  ? msgEl.dataset.stats.split('|') : []
        };
        const imgEl   = msgEl.querySelector('img.msg-image');
        if (imgEl) {
            data.push({ speakerId, type: 'image', src: imgEl.src, locked, ...tweet });
        } else {
            const textEl = msgEl.querySelector('.msg-text');
            data.push({ speakerId, type: 'text', text: textEl ? textEl.textContent : '', locked, ...tweet });
        }
    });
    return data;
}

function rebuildMessagesInCurrentMode() {
    const data = extractMessagesData();
    if (!data.length) return;

    Array.from(messagesContainer.children).forEach(el => {
        if (el.id !== 'empty-state') messagesContainer.removeChild(el);
    });

    data.forEach(m => {
        const s = speakers.find(sp => sp.id === m.speakerId);
        if (!s) return;
        const opts = { locked: m.locked, handle: m.handle, time: m.time, stats: m.stats };
        if (m.type === 'image') addImageToDOM(s, m.src, opts);
        else                    addMessageToDOM(s, m.text, opts);
    });

    syncEmptyState();
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessageToDOM(speaker, text, opts = {}) {
    const div = document.createElement('div');
    div.classList.add('message', `speaker-${speaker.id}`);
    if (opts.locked) div.classList.add('msg-locked');
    const content = document.createElement('div');
    content.className = 'msg-text';
    content.textContent = text;

    if (isCommentMode()) {
        div.appendChild(buildCommentAvatar(speaker));
        const body = document.createElement('div');
        body.className = 'comment-body';
        body.appendChild(buildCommentName(speaker, opts.locked));
        body.appendChild(content);
        div.appendChild(body);
        attachMessageActions(div, content);
        messagesContainer.appendChild(div);
        syncEmptyState();
        return content;
    }

    if (isTweetMode()) {
        if (opts.handle) div.dataset.handle = opts.handle;
        if (opts.time)   div.dataset.time   = opts.time;
        if (opts.stats && opts.stats.length) div.dataset.stats = opts.stats.join('|');
        if (speaker.show_handle === false) div.classList.add('hide-handle');
        div.appendChild(buildTweetAvatar(speaker));
        const body = document.createElement('div');
        body.className = 'tweet-body';
        body.appendChild(buildTweetHead(speaker, opts));
        body.appendChild(content);
        body.appendChild(buildTweetActions(opts));
        div.appendChild(body);
        attachMessageActions(div, content);
        messagesContainer.appendChild(div);
        syncEmptyState();
        return content;
    }

    const allMsgs = messagesContainer.getElementsByClassName('message');
    const lastMsg = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : null;
    const lastEl  = messagesContainer.lastElementChild;
    const isCont  = lastMsg && lastMsg.classList.contains(`speaker-${speaker.id}`);

    if (isCont) {
        lastMsg.classList.remove('is-last-message');
        if (lastEl && lastEl.classList.contains('message-header')) messagesContainer.removeChild(lastEl);
    }

    div.classList.add('is-last-message');
    div.appendChild(content);
    attachMessageActions(div, content);
    messagesContainer.appendChild(div);

    if (speaker.id !== 0 && speaker.show_name !== false) {
        messagesContainer.appendChild(buildMessageHeader(speaker, isGroupLocked(div)));
    }

    syncEmptyState();
    return content;
}

function isGroupLocked(startEl) {
    const sc = [...startEl.classList].find(c => /^speaker-\d+$/.test(c));
    let el = startEl;
    while (el && el.classList.contains(sc)) {
        if (el.classList.contains('msg-locked')) return true;
        el = el.previousElementSibling;
    }
    return false;
}

// ── 트위터 멘션(트윗) 빌더 ───────────────────────
const TWEET_ICONS = {
    reply:    '<path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.184-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>',
    retweet:  '<path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>',
    like:     '<path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>',
    view:     '<path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4z"/>',
    bookmark: '<path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/>',
    share:    '<path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/>'
};
function tweetIconSvg(name) {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${TWEET_ICONS[name]}</svg>`;
}

function buildTweetAvatar(speaker) {
    const avatar = document.createElement('div');
    avatar.className = 'tweet-avatar';
    if (speaker.avatar) {
        const img = document.createElement('img');
        img.src = speaker.avatar;
        img.alt = '';
        avatar.appendChild(img);
    }
    return avatar;
}

function buildTweetHead(speaker, opts = {}) {
    const head = document.createElement('div');
    head.className = 'tweet-head';

    const nameEl = document.createElement('span');
    nameEl.className = 'tweet-name';
    nameEl.textContent = speaker.name;
    head.appendChild(nameEl);

    if (opts.locked) {
        const lock = document.createElement('span');
        lock.className = 'tweet-lock';
        lock.title = '잠긴 계정';
        lock.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.75c-2.9 0-5.25 2.35-5.25 5.25v2.5H5.5c-1.24 0-2.25 1.01-2.25 2.25v7.5c0 1.24 1.01 2.25 2.25 2.25h13c1.24 0 2.25-1.01 2.25-2.25v-7.5c0-1.24-1.01-2.25-2.25-2.25h-1.25v-2.5c0-2.9-2.35-5.25-5.25-5.25zm3.25 7.75h-6.5v-2.5c0-1.79 1.46-3.25 3.25-3.25s3.25 1.46 3.25 3.25v2.5z"/></svg>';
        head.appendChild(lock);
    }

    const handleText = opts.handle || '';
    const timeText   = opts.time   || '';
    if (handleText || timeText) {
        const meta = document.createElement('span');
        meta.className = 'tweet-meta';
        if (handleText) {
            const h = document.createElement('span');
            h.className = 'tweet-handle';
            h.textContent = handleText;
            meta.appendChild(h);
        }
        if (handleText && timeText) {
            const sep = document.createElement('span');
            sep.className = 'tweet-sep';
            sep.textContent = ' · ';
            meta.appendChild(sep);
        }
        if (timeText) {
            const d = document.createElement('span');
            d.className = 'tweet-date';
            d.textContent = timeText;
            meta.appendChild(d);
        }
        head.appendChild(meta);
    }
    return head;
}

function buildTweetActions(opts = {}) {
    const stats = Array.isArray(opts.stats) ? opts.stats.slice(0, 4) : [];
    // 맨 마지막 수치는 항상 조회수, 앞에서부터 답글 / 리트윗 / 좋아요
    let reply = '', retweet = '', like = '', view = '';
    if      (stats.length === 1) { [view] = stats; }
    else if (stats.length === 2) { [reply, view] = stats; }
    else if (stats.length === 3) { [reply, retweet, view] = stats; }
    else if (stats.length >= 4) { [reply, retweet, like, view] = stats; }

    const bar = document.createElement('div');
    bar.className = 'tweet-actions';
    const mk = (icon, count) => {
        const el = document.createElement('span');
        el.className = 'tweet-act';
        el.innerHTML = tweetIconSvg(icon) + (count ? `<span class="tweet-count">${count}</span>` : '');
        return el;
    };
    bar.append(
        mk('reply', reply),
        mk('retweet', retweet),
        mk('like', like),
        mk('view', view),
        mk('bookmark', ''),
        mk('share', '')
    );
    return bar;
}

function buildCommentAvatar(speaker) {
    const avatar = document.createElement('div');
    avatar.className = 'comment-avatar';
    if (speaker.avatar) {
        const img = document.createElement('img');
        img.src = speaker.avatar;
        img.alt = '';
        avatar.appendChild(img);
    }
    return avatar;
}

function buildCommentName(speaker, locked) {
    const nameEl = document.createElement('div');
    nameEl.className = 'comment-name';
    const nameText = document.createElement('span');
    nameText.textContent = speaker.name;
    nameEl.appendChild(nameText);
    if (locked) {
        const lockIcon = document.createElement('span');
        lockIcon.className = 'header-lock';
        lockIcon.title = '비밀 댓글';
        lockIcon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        nameEl.appendChild(lockIcon);
    }
    return nameEl;
}

function buildMessageHeader(speaker, locked) {
    const hdr = document.createElement('div');
    hdr.classList.add('message-header', `header-for-speaker-${speaker.id}`);
    if (speaker.avatar) {
        const img = document.createElement('img');
        img.className = 'header-avatar';
        img.src = speaker.avatar;
        img.alt = '';
        hdr.appendChild(img);
    }
    const nameSpan = document.createElement('span');
    nameSpan.className = 'header-name';
    nameSpan.textContent = speaker.name;
    hdr.appendChild(nameSpan);
    if (locked) {
        const lockIcon = document.createElement('span');
        lockIcon.className = 'header-lock';
        lockIcon.title = '비밀 댓글';
        lockIcon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        hdr.appendChild(lockIcon);
    }
    return hdr;
}

// ── 이미지 메시지 DOM 생성 ───────────────────────
function addImageToDOM(speaker, src, opts = {}) {
    const div = document.createElement('div');
    div.classList.add('message', `speaker-${speaker.id}`);

    const wrap = document.createElement('div');
    wrap.className = 'msg-img-wrap';
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.src = src;
    img.alt = '이미지';
    img.addEventListener('click', () => openLightbox(src));
    wrap.appendChild(img);

    if (isCommentMode()) {
        div.appendChild(buildCommentAvatar(speaker));
        const body = document.createElement('div');
        body.className = 'comment-body';
        body.appendChild(buildCommentName(speaker));
        body.appendChild(wrap);
        div.appendChild(body);
        attachMessageActions(div, null);
        messagesContainer.appendChild(div);
        syncEmptyState();
        return;
    }

    if (isTweetMode()) {
        if (opts.handle) div.dataset.handle = opts.handle;
        if (opts.time)   div.dataset.time   = opts.time;
        if (opts.stats && opts.stats.length) div.dataset.stats = opts.stats.join('|');
        if (speaker.show_handle === false) div.classList.add('hide-handle');
        div.appendChild(buildTweetAvatar(speaker));
        const body = document.createElement('div');
        body.className = 'tweet-body';
        body.appendChild(buildTweetHead(speaker, opts));
        body.appendChild(wrap);
        body.appendChild(buildTweetActions(opts));
        div.appendChild(body);
        attachMessageActions(div, null);
        messagesContainer.appendChild(div);
        syncEmptyState();
        return;
    }

    const allMsgs = messagesContainer.getElementsByClassName('message');
    const lastMsg = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : null;
    const lastEl  = messagesContainer.lastElementChild;
    const isCont  = lastMsg && lastMsg.classList.contains(`speaker-${speaker.id}`);

    if (isCont) {
        lastMsg.classList.remove('is-last-message');
        if (lastEl && lastEl.classList.contains('message-header')) messagesContainer.removeChild(lastEl);
    }

    div.classList.add('is-last-message');
    div.appendChild(wrap);
    attachMessageActions(div, null);
    messagesContainer.appendChild(div);

    if (speaker.id !== 0 && speaker.show_name !== false) {
        messagesContainer.appendChild(buildMessageHeader(speaker, isGroupLocked(div)));
    }

    syncEmptyState();
}

function openLightbox(src) {
    const lb  = document.getElementById('img-lightbox');
    const img = document.getElementById('img-lightbox-img');
    img.src = src;
    lb.classList.add('show');
}

// ── 메시지 편집 헬퍼 ─────────────────────────────
function attachMessageActions(msgEl, textEl) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'msg-btn msg-edit-btn';
    editBtn.title = '편집 (더블클릭)';
    editBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

    const delBtn = document.createElement('button');
    delBtn.className = 'msg-btn msg-del-btn';
    delBtn.title = '삭제';
    delBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

    actions.append(editBtn, delBtn);
    msgEl.prepend(actions);

    if (textEl) {
        editBtn.addEventListener('click', e => { e.stopPropagation(); enableEdit(textEl); });
        textEl.addEventListener('dblclick', () => enableEdit(textEl));
    } else {
        editBtn.style.display = 'none';
    }
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteMessage(msgEl); });
}

function enableEdit(textEl) {
    if (textEl.contentEditable === 'true') return;
    const msgEl   = textEl.closest('.message');
    const original = textEl.textContent;

    textEl.contentEditable = 'true';
    msgEl.classList.add('editing');
    textEl.focus();

    const range = document.createRange();
    range.selectNodeContents(textEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function commit() {
        textEl.contentEditable = 'false';
        msgEl.classList.remove('editing');
        textEl.textContent = textEl.innerText;
    }

    function cancel() {
        textEl.textContent = original;
        textEl.contentEditable = 'false';
        msgEl.classList.remove('editing');
    }

    textEl.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
            cancel();
            textEl.removeEventListener('keydown', onKey);
            textEl.removeEventListener('blur', onBlur);
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
            textEl.removeEventListener('keydown', onKey);
            textEl.removeEventListener('blur', onBlur);
        }
    });

    function onBlur() { commit(); }
    textEl.addEventListener('blur', onBlur, { once: true });
}

function deleteMessage(msgEl) {
    msgEl.remove();
    rebuildMessageHeaders();
    syncEmptyState();
    showToast('메시지가 삭제되었습니다.');
}

function rebuildMessageHeaders() {
    if (isCommentMode() || isTweetMode()) return;
    messagesContainer.querySelectorAll('.message-header').forEach(h => h.remove());
    const msgs = [...messagesContainer.querySelectorAll('.message')];
    msgs.forEach(m => m.classList.remove('is-last-message'));

    msgs.forEach((msg, i) => {
        const sc   = [...msg.classList].find(c => /^speaker-\d+$/.test(c));
        const next = msgs[i + 1];
        const nextSc = next ? [...next.classList].find(c => /^speaker-\d+$/.test(c)) : null;

        if (sc !== nextSc) {
            msg.classList.add('is-last-message');
            const sid = sc ? parseInt(sc.replace('speaker-', '')) : null;
            if (sid !== null && sid !== 0) {
                const sp = speakers.find(s => s.id === sid);
                if (sp && sp.show_name !== false) {
                    msg.after(buildMessageHeader(sp, isGroupLocked(msg)));
                }
            }
        }
    });
}

// ── 메시지 전송 ───────────────────────────────────
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    const s = speakers.find(s => s.id === getCurrentSpeakerId());
    if (!s) return;
    addMessageToDOM(s, text);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    messageInput.value = '';
    messageInput.focus();
}

// ── 로그 파싱 (로그 종류별) ───────────────────────
function parsePastedLines(lines) {
    const results = [];

    if (currentLogType === 'kakao') {
        const re = LOG_TYPES.kakao.regex;
        let lastEntry = null;
        lines.forEach(line => {
            const t = line.trim(); if (!t) return;
            const m = t.match(re);
            if (m) { lastEntry = { speakerName: m[1].trim(), text: m[3].trim() }; results.push(lastEntry); }
            else if (lastEntry) { lastEntry.text += '\n' + t; }
        });

    } else if (currentLogType === 'twitter') {
        const { regexTab: reTab, timeRe } = LOG_TYPES.twitter;
        const fallbackName = speakers.find(s => s.id === getCurrentSpeakerId())?.name ?? null;

        const ring        = speakers.map(s => s.name);
        let ringIdx       = 0;
        let currentSpeaker = ring[0] ?? fallbackName;
        let pendingMsgs   = [];
        let expectName    = true;

        const selfName  = speakers.find(s => s.id === 0)?.name ?? fallbackName;
        const otherName = speakers.find(s => s.id !== 0)?.name ?? fallbackName;

        const flushMsgs = () => {
            const name = currentSpeaker ?? fallbackName;
            if (name) pendingMsgs.forEach(text => {
                if (text.trim()) results.push({ speakerName: name, text: text.trim() });
            });
            pendingMsgs = [];
        };

        let lastWasTime = false;

        lines.forEach(line => {
            const t = line.trim(); if (!t) return;

            const m = t.match(reTab);
            if (m) { flushMsgs(); results.push({ speakerName: m[1].trim(), text: m[2].trim() }); lastWasTime = false; return; }

            if (timeRe.test(t)) {
                flushMsgs();
                // 트위터 복사 시 타임스탬프가 연속 두 줄로 중복되므로, 연속된 타임스탬프는 하나의 전환으로만 처리
                if (!lastWasTime) {
                    const beforeSpeaker = currentSpeaker;

                    if (speakers.length === 2 && otherName) {
                        // 나 외 등록된 상대방이 1명뿐인 경우: 타임스탬프마다 나 ↔ 상대방으로 확실히 전환
                        currentSpeaker = (beforeSpeaker === selfName) ? otherName : selfName;
                        ringIdx = ring.indexOf(currentSpeaker);
                    } else {
                        ringIdx = (ringIdx + 1) % Math.max(ring.length, 1);
                        currentSpeaker = ring[ringIdx] ?? fallbackName;
                        // 순환으로 화자가 안 바뀌는 경우(화자 1명만 등록 등) 나 ↔ 상대방으로 강제 전환
                        if (currentSpeaker === beforeSpeaker) {
                            currentSpeaker = (beforeSpeaker === selfName) ? (otherName ?? fallbackName) : (selfName ?? fallbackName);
                            ringIdx = ring.indexOf(currentSpeaker);
                            if (ringIdx === -1) ringIdx = 0;
                        }
                    }
                    expectName = true;
                }
                lastWasTime = true;
                return;
            }

            lastWasTime = false;

            if (expectName) {
                expectName = false;
                const matched = speakers.find(s => s.name === t);
                if (matched) {
                    currentSpeaker = t;
                    ringIdx = ring.indexOf(t);
                    return;
                }
            }

            pendingMsgs.push(t);
        });
        flushMsgs();

    } else if (currentLogType === 'twitter_mention') {
        // 닉네임 → @아이디 → · → 시간 → 내용 → (반응 수)
        const raw = lines.map(l => l.trim()).filter(l => l.length > 0);
        const handleRe = /^@[A-Za-z0-9_]{1,20}(\s*·.*)?$/;
        const timeRe = /^(\d{4}년\s*)?(\d{1,2}월\s*\d{1,2}일|\d+초|\d+분|\d+시간|\d+일|\d+주|어제|그저께|오전\s*\d{1,2}:\d{2}|오후\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}|[A-Za-z]{3}\s+\d{1,2}(,\s*\d{4})?)$/;
        const uiSkip = new Set(['답글', '리트윗', '재게시', '인용', '마음에 들어요', '좋아요', '더 보기', '번역', '번역하기', '게시물 번역', '북마크', '공유하기', '팔로우', '팔로잉', '모든 활동 보기', '참여도 보기']);
        const countRe = /^[\d][\d.,]*\s*(천|만|억|K|M|B)?$/i;
        // 이름 줄과 @아이디 줄 사이에 낄 수 있는 배지 (값: 잠긴 계정 여부)
        const NAME_BADGE = { '인증됨': false, 'Verified account': false, '잠긴 계정': true, '보호된 계정': true, 'Protected account': true };

        const isHandle = s => handleRe.test(s);
        const nameStart = hi => {
            let ni = hi - 1;
            while (ni > 0 && Object.prototype.hasOwnProperty.call(NAME_BADGE, raw[ni])) ni--;
            return ni;
        };

        const handleIdx = [];
        raw.forEach((s, i) => { if (i > 0 && isHandle(s)) handleIdx.push(i); });

        handleIdx.forEach((hi, k) => {
            const ni = nameStart(hi);
            const name = raw[ni];
            if (!name || isHandle(name) || timeRe.test(name)) return;

            let locked = false;
            for (let x = ni + 1; x < hi; x++) {
                if (NAME_BADGE[raw[x]]) locked = true;
            }

            // @아이디 [· 시간] 분리
            const parts = raw[hi].split(/\s*·\s*/);
            let handle = parts[0].trim();
            let time   = parts.slice(1).join(' · ').trim();

            // @아이디 다음의 · / 시간 줄 건너뛰기
            let j = hi + 1;
            while (j < raw.length) {
                const s = raw[j].replace(/^[·•]\s*/, '').trim();
                if (s === '') { j++; continue; }
                if (!time && timeRe.test(s)) { time = s; j++; continue; }
                if (time && timeRe.test(s)) { j++; continue; }
                break;
            }

            const end = (k + 1 < handleIdx.length) ? nameStart(handleIdx[k + 1]) : raw.length;

            const contentLines = [];
            const stats = [];
            for (let x = j; x < end; x++) {
                const s = raw[x];
                if (uiSkip.has(s)) continue;
                if (countRe.test(s)) { stats.push(s.replace(/\s+/g, '')); continue; }
                if (/조회/.test(s)) {
                    const m = s.match(/[\d.,]+\s*(천|만|억|K|M|B)?/i);
                    if (m) stats.push(m[0].replace(/\s+/g, ''));
                    continue;
                }
                contentLines.push(s);
            }

            const text = contentLines.join('\n').trim();
            if (text) results.push({ speakerName: name, text, handle, time, stats: stats.slice(0, 4), locked });
        });

    } else if (currentLogType === 'band_comment') {
        const UI_SKIP = new Set(['표정짓기', '답글쓰기', '댓글 수정', '댓글']);
        const isDateLine = t => /^\d{1,2}월\s+\d{1,2}일\s+(오전|오후)\s+\d{1,2}:\d{2}/.test(t)
            || /^\d+\s*(분|시간)\s*전$/.test(t)
            || /^지금\s*막$/.test(t);
        const isUISkip = t => UI_SKIP.has(t) || /^멤버/.test(t);

        let state = 0;
        let currentName = null;
        let contentLines = [];

        const flushContent = () => {
            if (currentName && contentLines.length > 0) {
                const rawText = contentLines.join('\n');
                const locked  = /^비밀\s*댓글/.test(rawText);
                const text    = locked ? rawText.replace(/^비밀\s*댓글[:\s]*/, '').trim() : rawText;
                results.push({ speakerName: currentName, text, locked });
            }
            currentName = null;
            contentLines = [];
        };

        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;

            if (isDateLine(t)) {
                if (state === 2) flushContent();
                state = 3;
                continue;
            }

            if (isUISkip(t)) continue;

            if (state === 3) state = 0;

            if (state === 0)      { currentName = t; state = 1; }
            else if (state === 1) { state = 2; }
            else if (state === 2) { contentLines.push(t); }
        }
        if (state === 2) flushContent();

    } else if (currentLogType === 'band') {
        const { timeRe, dateLineRe } = LOG_TYPES.band;
        let pendingName = null;
        lines.forEach(line => {
            const t = line.trim(); if (!t) return;

            const dateMatch = t.match(dateLineRe);
            if (dateMatch) {
                pendingName = dateMatch[1].trim();
                return;
            }

            if (/^\d{1,2}:\d{2}$/.test(t)) return;

            if (pendingName === null) {
                const matched = speakers.find(s => s.name === t);
                if (matched) { pendingName = t; }
                return;
            }

            const rawMsgText = t.replace(timeRe, '').trim() || t;
            const locked = /^비밀\s*댓글/.test(rawMsgText);
            results.push({ speakerName: pendingName, text: locked ? '' : rawMsgText, locked });
            pendingName = null;
        });
    }

    return results;
}

// ── 붙여넣기 ─────────────────────────────────────
function handlePaste(event) {
    event.preventDefault();
    const rawText = event.clipboardData.getData('text');
    const lines   = rawText.split('\n');
    const parsed  = parsePastedLines(lines);
    const missed  = new Set();

    if (parsed.length > 0) {
        parsed.forEach(({ speakerName, text, locked, handle, time, stats }) => {
            const s = speakers.find(s => s.name === speakerName);
            if (s) { addMessageToDOM(s, text, { locked, handle, time, stats }); }
            else   { missed.add(speakerName); }
        });
        if (missed.size > 0) showToast(`미등록 발화자: ${[...missed].join(', ')}`);
    } else {
        const s = speakers.find(s => s.id === getCurrentSpeakerId());
        if (s && rawText.trim()) addMessageToDOM(s, rawText.trim());
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ── HTML 생성 ─────────────────────────────────────
function buildBackupHtml() {
    const msgs = messagesContainer.querySelectorAll('.message, .system-message, .message-header');
    let html = '';
    msgs.forEach(m => {
        const clone = m.cloneNode(true);
        clone.querySelectorAll('.msg-actions').forEach(a => a.remove());
        const dataAttrs = [...m.attributes]
            .filter(a => a.name.startsWith('data-'))
            .map(a => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
            .join('');
        html += `<div class="${[...m.classList].join(' ')}"${dataAttrs}>${clone.innerHTML}</div>\n`;
    });

    const fixedStaticCss = `
            .backup-body { font-family: 'Malgun Gothic', Arial, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; padding: 20px; }
            .chat-container { width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); overflow: hidden; display: flex; flex-direction: column; min-height: 400px; }
            .messages { flex-grow: 1; padding: 10px; display: flex; flex-direction: column; }
            .message { margin: 2px 0; padding: 10px 15px; border-radius: 18px; max-width: 70%; word-wrap: break-word; line-height: 1.4; position: relative; white-space: pre-wrap; }
            .message-header { font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 5px; }
            .header-avatar { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0; display: block; }
            .header-lock { display: flex; align-items: center; color: #9ca3af; flex-shrink: 0; }
            .system-message { text-align: center; color: #6c757d; font-size: 12px; margin: 10px 0; }
            .messages.comment-mode { gap: 0; }
            .messages.comment-mode .message { display: flex; align-items: flex-start; align-self: stretch !important; gap: 10px; max-width: 100%; padding: 10px 2px; margin: 0; border-radius: 0; border-bottom: 1px solid rgba(0,0,0,0.08); background: none !important; }
            .messages.comment-mode .message:last-child { border-bottom: none; }
            .comment-avatar { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; background: #e5e7eb; overflow: hidden; }
            .comment-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .comment-body { flex: 1; min-width: 0; }
            .comment-name { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 3px; }
            .messages.comment-mode .msg-text { color: #111827 !important; }
            .messages.tweet-mode { gap: 0; }
            .messages.tweet-mode .message { display: flex; align-items: flex-start; align-self: stretch !important; gap: 11px; max-width: 100% !important; padding: 11px 4px 8px; margin: 0; border-radius: 0; background: none !important; position: relative; white-space: normal; }
            .messages.tweet-mode .message:not(:last-child) { border-bottom: 1px solid rgba(0,0,0,0.08); }
            .messages.tweet-mode .message::before { content: ''; position: absolute; left: 23px; top: 0; bottom: 0; width: 2px; background: rgba(0,0,0,0.12); }
            .messages.tweet-mode .message:first-child::before { top: 52px; }
            .messages.tweet-mode .message:last-child::before { bottom: auto; height: 11px; }
            .messages.tweet-mode .message:first-child:last-child::before { display: none; }
            .tweet-avatar { width: 40px; height: 40px; flex-shrink: 0; border-radius: 50%; background: #e5e7eb; overflow: hidden; position: relative; z-index: 1; }
            .tweet-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .tweet-body { flex: 1; min-width: 0; }
            .tweet-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 14px; line-height: 1.3; margin-bottom: 2px; }
            .tweet-name { font-weight: 700; color: #0f1419; }
            .tweet-lock { display: inline-flex; color: #536471; }
            .tweet-meta { font-weight: 400; color: #536471; }
            .message.hide-handle .tweet-handle, .message.hide-handle .tweet-sep { display: none; }
            .messages.tweet-mode .msg-text { color: #0f1419 !important; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
            .tweet-actions { display: flex; align-items: center; justify-content: space-between; max-width: 440px; margin-top: 10px; color: #536471; }
            .tweet-act { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #536471; }
            .tweet-act svg { width: 17px; height: 17px; display: block; }
            .tweet-count { font-size: 12.5px; color: #536471; }`;

    const isComment = messagesContainer.classList.contains('comment-mode');
    const isTweet   = messagesContainer.classList.contains('tweet-mode');
    const modeClass = isComment ? ' comment-mode' : isTweet ? ' tweet-mode' : '';
    let speakerCss = '';
    for (const s of speakers) {
        speakerCss += `
                    .speaker-${s.id} .comment-avatar,
                    .speaker-${s.id} .tweet-avatar { background-color: ${s.color}; }`;
        if (s.id === 0) {
            speakerCss += `
                    .speaker-0 { align-self: flex-end; background-color: ${s.color}; color: ${s.text_color || '#ffffff'}; }
                    .speaker-0.is-last-message { border-bottom-right-radius: 2px; margin-bottom: 5px; }`;
        } else {
            speakerCss += `
                    .speaker-${s.id} { align-self: flex-start; background-color: ${s.color}; color: ${s.text_color || '#050505'}; }
                    .header-for-speaker-${s.id} { align-self: flex-start; color: ${s.name_color || '#536471'}; margin-left: 5px; margin-top: 2px; margin-bottom: 5px; }
                    .speaker-${s.id}.is-last-message { border-bottom-left-radius: 2px; margin-bottom: 0px; }`;
        }
    }

    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>DM 백업</title>
    <style>
${fixedStaticCss}
${speakerCss}
    </style>
</head>
<body class="backup-body">
    <div class="chat-container">
        <div class="messages${modeClass}">
${html}
        </div>
    </div>
</body>
</html>`;
}

// ── HTML 복사 ─────────────────────────────────────
function copyMessagesAsHtml() {
    navigator.clipboard.writeText(buildBackupHtml())
        .then(() => showToast('HTML 복사 완료!'))
        .catch(() => showToast('복사 실패 — 브라우저 설정을 확인해주세요.'));
}

// ── HTML 파일로 저장 ──────────────────────────────
function exportHtmlFile() {
    if (!messagesContainer.querySelector('.message')) {
        showToast('저장할 메시지가 없습니다.'); return;
    }
    const blob = new Blob([buildBackupHtml()], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `DM_백업_${new Date().toISOString().slice(0, 10)}.html`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    showToast('HTML 파일 저장 완료!');
}

// ── PNG 저장 ──────────────────────────────────────
function exportPng() {
    if (!messagesContainer.querySelector('.message')) {
        showToast('저장할 메시지가 없습니다.'); return;
    }
    pngLoading.classList.add('show');
    setTimeout(() => {
        html2canvas(messagesContainer, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            logging: false,
            removeContainer: true
        }).then(canvas => {
            pngLoading.classList.remove('show');
            const link = document.createElement('a');
            link.download = `DM_백업_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('PNG 저장 완료!');
        }).catch(err => {
            pngLoading.classList.remove('show');
            console.error(err);
            showToast('PNG 저장 실패 — 콘솔을 확인해주세요.');
        });
    }, 60);
}

// ── 백업 파일 불러오기 ────────────────────────────
function loadBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(e.target.result, 'text/html');

        const msgEls = doc.querySelectorAll('.messages > *');
        if (!msgEls.length) {
            showToast('메시지를 찾을 수 없습니다. 올바른 백업 파일인지 확인해주세요.');
            return;
        }

        messagesContainer.classList.toggle('comment-mode', !!doc.querySelector('.messages.comment-mode'));
        messagesContainer.classList.toggle('tweet-mode', !!doc.querySelector('.messages.tweet-mode'));

        Array.from(messagesContainer.children).forEach(el => {
            if (el.id !== 'empty-state') messagesContainer.removeChild(el);
        });

        const styleEls = doc.querySelectorAll('style');
        styleEls.forEach(style => {
            const text = style.textContent;
            const bgRe = /\.speaker-(\d+)\s*\{[^}]*background-color:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
            let m;
            while ((m = bgRe.exec(text)) !== null) {
                document.documentElement.style.setProperty(`--speaker-${m[1]}-bubble`, m[2]);
            }
            const nameRe = /\.header-for-speaker-(\d+)\s*\{[^}]*color:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
            while ((m = nameRe.exec(text)) !== null) {
                document.documentElement.style.setProperty(`--speaker-${m[1]}-name`, m[2]);
            }
        });

        msgEls.forEach(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.msg-actions').forEach(a => a.remove());
            messagesContainer.appendChild(clone);
        });

        messagesContainer.querySelectorAll('.message').forEach(msgEl => {
            const imgEl  = msgEl.querySelector('img.msg-image, .msg-img-wrap img');
            if (imgEl) {
                imgEl.classList.add('msg-image');
                imgEl.addEventListener('click', () => openLightbox(imgEl.src));
                attachMessageActions(msgEl, null);
            } else {
                const textEl = msgEl.querySelector('.msg-text') || msgEl.querySelector('div:not(.msg-actions)') || msgEl.firstElementChild;
                if (textEl) {
                    textEl.classList.add('msg-text');
                    attachMessageActions(msgEl, textEl);
                }
            }
        });

        syncEmptyState();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        showToast(`백업 파일을 불러왔습니다. (메시지 ${messagesContainer.querySelectorAll('.message').length}개)`);
    };
    reader.readAsText(file, 'UTF-8');
}

// ── 이벤트 바인딩 ─────────────────────────────────
document.getElementById('add-speaker-btn').addEventListener('click',  addSpeaker);
document.getElementById('change-name-btn').addEventListener('click',  changeSpeakerName);
document.getElementById('copy-html-btn').addEventListener('click',    copyMessagesAsHtml);
document.getElementById('export-html-btn').addEventListener('click',  exportHtmlFile);
document.getElementById('export-png-btn').addEventListener('click',   exportPng);
document.getElementById('clear-btn').addEventListener('click',        clearMessages);
document.getElementById('send-btn').addEventListener('click',         sendMessage);
document.getElementById('load-backup-btn').addEventListener('click',  () => document.getElementById('load-backup-input').click());
document.getElementById('load-backup-input').addEventListener('change', e => { loadBackupFile(e.target.files[0]); e.target.value = ''; });
document.getElementById('img-upload-btn').addEventListener('click',   () => document.getElementById('img-upload-input').click());
document.getElementById('img-upload-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const s = speakers.find(s => s.id === getCurrentSpeakerId());
        if (s) { addImageToDOM(s, ev.target.result); messagesContainer.scrollTop = messagesContainer.scrollHeight; }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});
document.getElementById('img-lightbox').addEventListener('click', () => {
    document.getElementById('img-lightbox').classList.remove('show');
});
document.getElementById('avatar-upload-btn').addEventListener('click', () => avatarUploadInput.click());
avatarUploadInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setSpeakerAvatar(getCurrentSpeakerId(), ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
});
document.getElementById('avatar-remove-btn').addEventListener('click', removeSpeakerAvatar);
speakerSelect.addEventListener('change',    () => { loadSpeakerSettings(); updateSpeakerChips(); });
bubbleColorInput.addEventListener('input',  () => updateSpeakerColor('bubble'));
textColorInput.addEventListener('input',    () => updateSpeakerColor('text'));
nameColorInput.addEventListener('input',    () => updateSpeakerColor('name'));
messageInput.addEventListener('keypress',   e => { if (e.key === 'Enter') sendMessage(); });
messageInput.addEventListener('paste',      handlePaste);

// ── 모바일 패널 드로어 ────────────────────────────
const ctrlPane      = document.querySelector('.ctrl-pane');
const panelOverlay  = document.getElementById('panel-overlay');

function openPanel() {
    ctrlPane.classList.add('open');
    panelOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closePanel() {
    ctrlPane.classList.remove('open');
    panelOverlay.classList.remove('show');
    document.body.style.overflow = '';
}

document.getElementById('panel-toggle-btn').addEventListener('click', openPanel);
document.getElementById('panel-close-btn').addEventListener('click', closePanel);
panelOverlay.addEventListener('click', closePanel);

// ── 초기화 ────────────────────────────────────────
initLogTabs();
updateDynamicStyles();
applyCssVariables();
updateSpeakerDropdown();
syncEmptyState();

// ── 웰컴 모달 ─────────────────────────────────────
(function () {
    const STORAGE_KEY = 'chatBackupIntroDismissed';
    const overlay     = document.getElementById('welcome-overlay');
    const closeBtn    = document.getElementById('welcome-close-btn');
    const startBtn    = document.getElementById('welcome-start-btn');
    const noShowCheck = document.getElementById('welcome-no-show-check');

    function closeModal() {
        if (noShowCheck.checked) {
            localStorage.setItem(STORAGE_KEY, '1');
        }
        overlay.classList.remove('show');
    }

    if (!localStorage.getItem(STORAGE_KEY)) {
        overlay.classList.add('show');
    }

    startBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
    });
})();
