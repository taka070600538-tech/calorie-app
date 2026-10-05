// 食事記録の名前をドラッグして、同じ食事区分の中で並べ替える。
// マウスとタッチの両方を扱うためPointer Eventsを使う。名前部分はtouch-action:noneなので、
// 名前に触れて動かしたときだけ並べ替えになり、それ以外の場所では通常どおりスクロールできる。
const DRAG_THRESHOLD_PX = 6;
const AUTO_SCROLL_EDGE_PX = 60;
const AUTO_SCROLL_STEP_PX = 12;

export function bindMealDrag(root, { onReorder }) {
  let drag = null;

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest('.meal-item-name');
    if (!handle) return;
    const item = handle.closest('.meal-item');
    const list = item?.parentElement;
    if (!item || !list) return;
    // マウスで名前を掴んだときに周囲の文字が範囲選択されるのを防ぐ。
    event.preventDefault();
    drag = { handle, item, list, pointerId: event.pointerId, startY: event.clientY, active: false };
    handle.setPointerCapture(event.pointerId);
  });

  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      drag.item.classList.add('is-dragging');
    }
    event.preventDefault();
    moveItemTo(drag.list, drag.item, event.clientY);
    autoScroll(event.clientY);
  });

  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { item, list, active } = drag;
    drag = null;
    if (!active) return;
    item.classList.remove('is-dragging');
    const orderedIds = [...list.querySelectorAll(':scope > .meal-item')].map((li) => Number(li.dataset.mealId));
    onReorder(orderedIds);
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
}

// ポインタのY座標より中心が下にある最初の項目の前へ挿入する(無ければ末尾)。
function moveItemTo(list, item, clientY) {
  const siblings = [...list.querySelectorAll(':scope > .meal-item')].filter((li) => li !== item);
  const next = siblings.find((li) => {
    const rect = li.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  if (next) {
    if (item.nextElementSibling !== next) list.insertBefore(item, next);
  } else if (list.lastElementChild !== item) {
    list.appendChild(item);
  }
}

function autoScroll(clientY) {
  if (clientY < AUTO_SCROLL_EDGE_PX) window.scrollBy(0, -AUTO_SCROLL_STEP_PX);
  else if (clientY > window.innerHeight - AUTO_SCROLL_EDGE_PX) window.scrollBy(0, AUTO_SCROLL_STEP_PX);
}
