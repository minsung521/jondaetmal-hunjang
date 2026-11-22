// A floating box that shows JSON in a read-only text area with a copy button.
// Used for tuning values the user pastes back into the chat (no file downloads).

export interface JsonBox {
  show(title: string, text: string): void;
  /** Replaces the text if the box is open (live updates while tuning). */
  update(text: string): void;
  hide(): void;
  readonly open: boolean;
}

export function createJsonBox(): JsonBox {
  const box = document.createElement('div');
  box.className = 'json-box';
  box.style.display = 'none';
  const head = document.createElement('div');
  head.className = 'json-box-head';
  const title = document.createElement('span');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '닫기';
  head.append(title, close);
  const note = document.createElement('div');
  note.className = 'json-box-note';
  note.textContent = '이 JSON을 대화창에 붙여 주세요. 슬라이더를 움직이면 바로 바뀝니다.';
  const textarea = document.createElement('textarea');
  textarea.readOnly = true;
  textarea.rows = 14;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'JSON 복사';
  box.append(head, note, textarea, copy);
  document.body.appendChild(box);

  copy.addEventListener('click', async () => {
    textarea.select();
    try {
      await navigator.clipboard.writeText(textarea.value);
      copy.textContent = '복사했어요 ✓';
    } catch {
      document.execCommand('copy');
      copy.textContent = '선택됨 · Ctrl/⌘+C';
    }
    setTimeout(() => (copy.textContent = 'JSON 복사'), 1800);
  });
  close.addEventListener('click', () => api.hide());

  const api: JsonBox = {
    show(t, text) {
      title.textContent = t;
      textarea.value = text;
      box.style.display = '';
    },
    update(text) {
      if (box.style.display !== 'none') textarea.value = text;
    },
    hide() {
      box.style.display = 'none';
    },
    get open() {
      return box.style.display !== 'none';
    },
  };
  return api;
}
