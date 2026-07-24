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
        regexColon: /^(.+?):\s+(.+)$/,
        timeRe:     /^(오전|오후)\s+\d{1,2}:\d{2}$/
    },
    band: {
        label: '밴드 채팅',
        hint: `<b>형식 A:</b> 이름(단독 줄) → 메시지 줄<br><b>형식 B:</b> <code>yyyy.mm.dd hh:mm 이름</code> → 메시지 줄<br>두 형식 모두 지원합니다.`,
        timeRe:     /\s*\d{1,2}:\d{2}$/,
        dateLineRe: /^\d{4}\.\d{2}\.\d{2}\s+\d{1,2}:\d{2}\s+(.+)$/
    },
    band_comment: {
        label: '밴드 댓글',
        hint: `<b>형식:</b> 이름 → 내용 <br>밴드 게시글 댓글을 그대로 붙여넣으세요.`
    }
};

let currentLogType = 'kakao';

// ── 상태 ──────────────────────────────────────────
let speakers = [
    { id: 0, name: "나",       color: "#6366f1", align: "flex-end",   name_color: null,      text_color: "#ffffff" },
    { id: 1, name: "상대방 A", color: "#e5e7eb", align: "flex-start", name_color: "#6b7280", text_color: "#111827", show_name: true }
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
        });
    });
    updateLogHint();
}
function updateLogHint() { logHint.innerHTML = LOG_TYPES[currentLogType].hint; }

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
        dot.style.background = s.color;

        const name = document.createElement('div');
        name.className = 'chip-name';
        name.textContent = s.name;

        const tag = document.createElement('div');
        tag.className = 'chip-tag';
        tag.textContent = s.id === 0 ? '나' : '상대';

        chip.append(dot, name, tag);

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
    const newS   = { id: newId, name: `상대방 ${speakers.length}`, color: colors.bg, align: 'flex-start', name_color: colors.name, text_color: '#111827', show_name: true };
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
function addMessageToDOM(speaker, text) {
    const allMsgs = messagesContainer.getElementsByClassName('message');
    const lastMsg = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : null;
    const lastEl  = messagesContainer.lastElementChild;
    const isCont  = lastMsg && lastMsg.classList.contains(`speaker-${speaker.id}`);

    if (isCont) {
        lastMsg.classList.remove('is-last-message');
        if (lastEl && lastEl.classList.contains('message-header')) messagesContainer.removeChild(lastEl);
    }

    const div = document.createElement('div');
    div.classList.add('message', `speaker-${speaker.id}`, 'is-last-message');
    const content = document.createElement('div');
    content.className = 'msg-text';
    content.textContent = text;
    div.appendChild(content);
    attachMessageActions(div, content);
    messagesContainer.appendChild(div);

    if (speaker.id !== 0 && speaker.show_name !== false) {
        const hdr = document.createElement('div');
        hdr.classList.add('message-header', `header-for-speaker-${speaker.id}`);
        hdr.textContent = speaker.name;
        messagesContainer.appendChild(hdr);
    }

    syncEmptyState();
    return content;
}

// ── 이미지 메시지 DOM 생성 ───────────────────────
function addImageToDOM(speaker, src) {
    const allMsgs = messagesContainer.getElementsByClassName('message');
    const lastMsg = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : null;
    const lastEl  = messagesContainer.lastElementChild;
    const isCont  = lastMsg && lastMsg.classList.contains(`speaker-${speaker.id}`);

    if (isCont) {
        lastMsg.classList.remove('is-last-message');
        if (lastEl && lastEl.classList.contains('message-header')) messagesContainer.removeChild(lastEl);
    }

    const div = document.createElement('div');
    div.classList.add('message', `speaker-${speaker.id}`, 'is-last-message');

    const wrap = document.createElement('div');
    wrap.className = 'msg-img-wrap';
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.src = src;
    img.alt = '이미지';
    img.addEventListener('click', () => openLightbox(src));
    wrap.appendChild(img);
    div.appendChild(wrap);
    attachMessageActions(div, null);
    messagesContainer.appendChild(div);

    if (speaker.id !== 0 && speaker.show_name !== false) {
        const hdr = document.createElement('div');
        hdr.classList.add('message-header', `header-for-speaker-${speaker.id}`);
        hdr.textContent = speaker.name;
        messagesContainer.appendChild(hdr);
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
                    const hdr = document.createElement('div');
                    hdr.classList.add('message-header', `header-for-speaker-${sid}`);
                    hdr.textContent = sp.name;
                    msg.after(hdr);
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
        const { regexTab: reTab, regexColon: reColon, timeRe } = LOG_TYPES.twitter;
        const fallbackName = speakers.find(s => s.id === getCurrentSpeakerId())?.name ?? null;

        const ring        = speakers.map(s => s.name);
        let ringIdx       = 0;
        let currentSpeaker = ring[0] ?? fallbackName;
        let pendingMsgs   = [];
        let expectName    = true;

        const flushMsgs = () => {
            const name = currentSpeaker ?? fallbackName;
            if (name) pendingMsgs.forEach(text => {
                if (text.trim()) results.push({ speakerName: name, text: text.trim() });
            });
            pendingMsgs = [];
        };

        lines.forEach(line => {
            const t = line.trim(); if (!t) return;

            let m = t.match(reTab);
            if (m) { flushMsgs(); results.push({ speakerName: m[1].trim(), text: m[2].trim() }); return; }
            m = t.match(reColon);
            if (m) { flushMsgs(); results.push({ speakerName: m[1].trim(), text: m[2].trim() }); return; }

            if (timeRe.test(t)) {
                flushMsgs();
                ringIdx = (ringIdx + 1) % Math.max(ring.length, 1);
                currentSpeaker = ring[ringIdx] ?? fallbackName;
                expectName = true;
                return;
            }

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
            if (currentName && contentLines.length > 0)
                results.push({ speakerName: currentName, text: contentLines.join('\n') });
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

            const msgText = t.replace(timeRe, '').trim();
            results.push({ speakerName: pendingName, text: msgText || t });
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
        parsed.forEach(({ speakerName, text }) => {
            const s = speakers.find(s => s.name === speakerName);
            if (s) { addMessageToDOM(s, text); }
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
        html += `<div class="${[...m.classList].join(' ')}">${clone.innerHTML}</div>\n`;
    });

    const fixedStaticCss = `
            .backup-body { font-family: 'Malgun Gothic', Arial, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; padding: 20px; }
            .chat-container { width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); overflow: hidden; display: flex; flex-direction: column; min-height: 400px; }
            .messages { flex-grow: 1; padding: 10px; display: flex; flex-direction: column; }
            .message { margin: 2px 0; padding: 10px 15px; border-radius: 18px; max-width: 70%; word-wrap: break-word; line-height: 1.4; position: relative; white-space: pre-wrap; }
            .message-header { font-size: 12px; font-weight: bold; }
            .system-message { text-align: center; color: #6c757d; font-size: 12px; margin: 10px 0; }`;

    let speakerCss = '';
    for (const s of speakers) {
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
        <div class="messages">
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
            const imgEl  = msgEl.querySelector('img.msg-image, img');
            if (imgEl) {
                imgEl.classList.add('msg-image');
                imgEl.addEventListener('click', () => openLightbox(imgEl.src));
                attachMessageActions(msgEl, null);
            } else {
                const textEl = msgEl.querySelector('div:not(.msg-actions)') || msgEl.firstElementChild;
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
