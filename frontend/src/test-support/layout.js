const DEFAULT_ROW_HEIGHT = 42;
const DEFAULT_DIVIDER_HEIGHT = 2;

function parsePixelValue(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getElementTestId(element) {
  return element.getAttribute('data-testid') || '';
}

function getElementLayoutHeight(element) {
  const testId = getElementTestId(element);

  if (/^(note|todo-list)-(reorder-)?row-\d+$/.test(testId)) {
    return DEFAULT_ROW_HEIGHT;
  }

  if (element.classList.contains('MuiDivider-root')) {
    return DEFAULT_DIVIDER_HEIGHT;
  }

  return null;
}

function measureElementStartPixels(element, rowTestIds, rowStartPixels, startPixel) {
  const testId = getElementTestId(element);
  if (rowTestIds.has(testId)) {
    rowStartPixels[testId] = startPixel;
  }

  const fixedHeight = getElementLayoutHeight(element);
  if (fixedHeight !== null) {
    return fixedHeight;
  }

  let measuredHeight = 0;
  const gap = parsePixelValue(element.style.gap);

  Array.from(element.children).forEach((child, index) => {
    if (index > 0) {
      measuredHeight += gap;
    }

    measuredHeight += measureElementStartPixels(
      child,
      rowTestIds,
      rowStartPixels,
      startPixel + measuredHeight,
    );
  });

  return measuredHeight;
}

export function collectRowStartPixels(container, rowTestIds) {
  const rowStartPixels = {};

  measureElementStartPixels(container, new Set(rowTestIds), rowStartPixels, 0);

  return rowStartPixels;
}
