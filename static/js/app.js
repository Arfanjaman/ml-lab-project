/*
 * LocalChart — a tiny, dependency-free canvas chart renderer used by this dashboard.
 * It intentionally implements only the Chart.js-style subset the dashboard needs:
 * bar, horizontal bar, line, pie, doughnut and polarArea charts.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function firstColor(value, index = 0, fallback = '#4f46e5') {
    if (Array.isArray(value)) return value[index % Math.max(1, value.length)] || fallback;
    return value || fallback;
  }

  function niceMax(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const n = value / power;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * power;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function truncate(ctx, text, maxWidth) {
    const raw = String(text ?? '');
    if (ctx.measureText(raw).width <= maxWidth) return raw;
    let out = raw;
    while (out.length > 3 && ctx.measureText(out + '…').width > maxWidth) {
      out = out.slice(0, -1);
    }
    return out + '…';
  }

  class LocalChart {
    constructor(canvas, config) {
      if (!canvas || !canvas.getContext) throw new Error('Chart canvas not found');
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.config = config || {};
      this.hitRegions = [];
      this._onMove = this._onMove.bind(this);
      this._onLeave = this._onLeave.bind(this);
      this._resize = this._resize.bind(this);

      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.display = 'block';

      this.tooltip = document.createElement('div');
      Object.assign(this.tooltip.style, {
        position: 'absolute',
        display: 'none',
        pointerEvents: 'none',
        zIndex: '5',
        maxWidth: '260px',
        padding: '8px 10px',
        borderRadius: '9px',
        background: 'rgba(15, 23, 42, .94)',
        color: '#fff',
        font: '12px ui-sans-serif, system-ui, sans-serif',
        lineHeight: '1.35',
        boxShadow: '0 6px 18px rgba(15, 23, 42, .18)'
      });
      if (canvas.parentElement) canvas.parentElement.appendChild(this.tooltip);

      canvas.addEventListener('mousemove', this._onMove);
      canvas.addEventListener('mouseleave', this._onLeave);
      this.resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(this._resize)
        : null;
      if (this.resizeObserver && canvas.parentElement) this.resizeObserver.observe(canvas.parentElement);
      window.addEventListener('resize', this._resize);

      this._resize();
    }

    destroy() {
      if (this.resizeObserver) this.resizeObserver.disconnect();
      window.removeEventListener('resize', this._resize);
      this.canvas.removeEventListener('mousemove', this._onMove);
      this.canvas.removeEventListener('mouseleave', this._onLeave);
      if (this.tooltip && this.tooltip.parentElement) this.tooltip.remove();
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    _resize() {
      const parent = this.canvas.parentElement || this.canvas;
      const rect = parent.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width || 700));
      const height = Math.max(300, Math.floor(rect.height || 430));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cssWidth = width;
      this.cssHeight = height;
      this.dpr = dpr;
      this.canvas.width = Math.floor(width * dpr);
      this.canvas.height = Math.floor(height * dpr);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }

    _theme() {
      return {
        text: cssVar('--text', '#0f172a'),
        muted: cssVar('--muted', '#64748b'),
        border: cssVar('--border', '#e2e8f0'),
        surface: cssVar('--surface', '#ffffff')
      };
    }

    _font(size = 12, weight = 400) {
      this.ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    }

    draw() {
      const ctx = this.ctx;
      const w = this.cssWidth || 700;
      const h = this.cssHeight || 430;
      ctx.clearRect(0, 0, w, h);
      this.hitRegions = [];
      this.tooltip.style.display = 'none';

      const type = this.config.type || 'bar';
      if (type === 'pie' || type === 'doughnut') return this._drawCircular(type);
      if (type === 'polarArea') return this._drawPolar();
      if (type === 'line') return this._drawLine();
      return this._drawBar();
    }

    _legend(items, y, maxItems = 10) {
      const ctx = this.ctx;
      const theme = this._theme();
      const visible = items.slice(0, maxItems);
      if (items.length > maxItems) visible.push({ label: `+${items.length - maxItems} more`, color: theme.muted, noBox: true });

      this._font(11, 500);
      let x = 18;
      let rowY = y;
      const maxX = this.cssWidth - 18;
      for (const item of visible) {
        const label = String(item.label ?? '');
        const itemWidth = (item.noBox ? 0 : 16) + ctx.measureText(label).width + 18;
        if (x + itemWidth > maxX && x > 18) {
          x = 18;
          rowY += 20;
        }
        if (!item.noBox) {
          ctx.fillStyle = item.color || theme.muted;
          ctx.fillRect(x, rowY - 9, 10, 10);
          x += 16;
        }
        ctx.fillStyle = theme.muted;
        ctx.fillText(label, x, rowY);
        x += ctx.measureText(label).width + 18;
      }
      return rowY;
    }

    _datasetLegend(y) {
      const datasets = this.config.data?.datasets || [];
      if (datasets.length <= 1) return y;
      const items = datasets.map((ds, i) => ({
        label: ds.label || `Series ${i + 1}`,
        color: firstColor(ds.backgroundColor, 0, firstColor(ds.borderColor, 0))
      }));
      return this._legend(items, y, 8);
    }

    _drawAxes(plot, maxValue, horizontal) {
      const ctx = this.ctx;
      const theme = this._theme();
      const ticks = 5;
      this._font(11);
      ctx.strokeStyle = theme.border;
      ctx.fillStyle = theme.muted;
      ctx.lineWidth = 1;

      if (!horizontal) {
        for (let i = 0; i <= ticks; i++) {
          const y = plot.bottom - (plot.height * i / ticks);
          const value = maxValue * i / ticks;
          ctx.beginPath();
          ctx.moveTo(plot.left, y);
          ctx.lineTo(plot.right, y);
          ctx.stroke();
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(formatNumber(Math.round(value)), plot.left - 8, y);
        }
      } else {
        for (let i = 0; i <= ticks; i++) {
          const x = plot.left + (plot.width * i / ticks);
          const value = maxValue * i / ticks;
          ctx.beginPath();
          ctx.moveTo(x, plot.top);
          ctx.lineTo(x, plot.bottom);
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(formatNumber(Math.round(value)), x, plot.bottom + 8);
        }
      }
    }

    _drawBar() {
      const ctx = this.ctx;
      const theme = this._theme();
      const labels = this.config.data?.labels || [];
      const datasets = this.config.data?.datasets || [];
      const horizontal = this.config.options?.indexAxis === 'y';
      const stacked = Boolean(horizontal
        ? this.config.options?.scales?.x?.stacked
        : this.config.options?.scales?.y?.stacked);

      const legendBottom = this._datasetLegend(18);
      const top = datasets.length > 1 ? legendBottom + 18 : 18;
      const left = horizontal ? Math.min(155, Math.max(88, this.cssWidth * 0.22)) : 58;
      const rightPad = 18;
      const bottomPad = horizontal ? 42 : (labels.length > 10 ? 82 : 58);
      const plot = {
        left,
        top,
        right: this.cssWidth - rightPad,
        bottom: this.cssHeight - bottomPad
      };
      plot.width = Math.max(40, plot.right - plot.left);
      plot.height = Math.max(40, plot.bottom - plot.top);

      let maxValue = 0;
      if (stacked) {
        labels.forEach((_, i) => {
          const sum = datasets.reduce((s, ds) => s + Number(ds.data?.[i] || 0), 0);
          maxValue = Math.max(maxValue, sum);
        });
      } else {
        datasets.forEach(ds => (ds.data || []).forEach(v => { maxValue = Math.max(maxValue, Number(v || 0)); }));
      }
      maxValue = niceMax(maxValue);
      this._drawAxes(plot, maxValue, horizontal);

      this._font(11);
      if (!horizontal) {
        const categoryW = plot.width / Math.max(1, labels.length);
        const innerW = categoryW * 0.72;
        const dsCount = Math.max(1, datasets.length);
        const groupBarW = stacked ? innerW : innerW / dsCount;
        const skip = Math.max(1, Math.ceil(labels.length / Math.max(6, Math.floor(plot.width / 70))));

        labels.forEach((label, i) => {
          const center = plot.left + categoryW * (i + 0.5);
          if (i % skip === 0) {
            ctx.save();
            ctx.fillStyle = theme.muted;
            ctx.textAlign = labels.length > 10 ? 'right' : 'center';
            ctx.textBaseline = 'top';
            if (labels.length > 10) {
              ctx.translate(center, plot.bottom + 10);
              ctx.rotate(-Math.PI / 4);
              ctx.fillText(truncate(ctx, label, 110), 0, 0);
            } else {
              ctx.fillText(truncate(ctx, label, Math.max(45, categoryW * 1.4)), center, plot.bottom + 10);
            }
            ctx.restore();
          }

          let stackBottom = plot.bottom;
          datasets.forEach((ds, d) => {
            const value = Number(ds.data?.[i] || 0);
            const barH = plot.height * value / maxValue;
            const x = stacked
              ? center - groupBarW / 2
              : center - innerW / 2 + d * groupBarW;
            const y = stacked ? stackBottom - barH : plot.bottom - barH;
            ctx.fillStyle = firstColor(ds.backgroundColor, i);
            ctx.fillRect(x + 1, y, Math.max(1, groupBarW - 2), barH);
            this.hitRegions.push({
              shape: 'rect', x: x + 1, y, w: Math.max(1, groupBarW - 2), h: barH,
              label: label, group: ds.label || 'Count', value
            });
            if (stacked) stackBottom = y;
          });
        });
      } else {
        const categoryH = plot.height / Math.max(1, labels.length);
        const innerH = categoryH * 0.72;
        const dsCount = Math.max(1, datasets.length);
        const groupBarH = stacked ? innerH : innerH / dsCount;
        const skip = Math.max(1, Math.ceil(labels.length / Math.max(8, Math.floor(plot.height / 28))));

        labels.forEach((label, i) => {
          const center = plot.top + categoryH * (i + 0.5);
          if (i % skip === 0) {
            ctx.fillStyle = theme.muted;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(truncate(ctx, label, left - 16), plot.left - 8, center);
          }
          let stackLeft = plot.left;
          datasets.forEach((ds, d) => {
            const value = Number(ds.data?.[i] || 0);
            const barW = plot.width * value / maxValue;
            const y = stacked
              ? center - groupBarH / 2
              : center - innerH / 2 + d * groupBarH;
            const x = stacked ? stackLeft : plot.left;
            ctx.fillStyle = firstColor(ds.backgroundColor, i);
            ctx.fillRect(x, y + 1, barW, Math.max(1, groupBarH - 2));
            this.hitRegions.push({
              shape: 'rect', x, y: y + 1, w: barW, h: Math.max(1, groupBarH - 2),
              label: label, group: ds.label || 'Count', value
            });
            if (stacked) stackLeft += barW;
          });
        });
      }
    }

    _drawLine() {
      const ctx = this.ctx;
      const theme = this._theme();
      const labels = this.config.data?.labels || [];
      const datasets = this.config.data?.datasets || [];
      const legendBottom = this._datasetLegend(18);
      const plot = {
        left: 58,
        top: datasets.length > 1 ? legendBottom + 18 : 18,
        right: this.cssWidth - 18,
        bottom: this.cssHeight - (labels.length > 10 ? 82 : 58)
      };
      plot.width = Math.max(40, plot.right - plot.left);
      plot.height = Math.max(40, plot.bottom - plot.top);

      let maxValue = 0;
      datasets.forEach(ds => (ds.data || []).forEach(v => { maxValue = Math.max(maxValue, Number(v || 0)); }));
      maxValue = niceMax(maxValue);
      this._drawAxes(plot, maxValue, false);

      const step = labels.length > 1 ? plot.width / (labels.length - 1) : 0;
      const skip = Math.max(1, Math.ceil(labels.length / Math.max(6, Math.floor(plot.width / 70))));
      this._font(11);
      labels.forEach((label, i) => {
        if (i % skip !== 0) return;
        const x = labels.length > 1 ? plot.left + step * i : plot.left + plot.width / 2;
        ctx.save();
        ctx.fillStyle = theme.muted;
        ctx.textBaseline = 'top';
        if (labels.length > 10) {
          ctx.translate(x, plot.bottom + 10);
          ctx.rotate(-Math.PI / 4);
          ctx.textAlign = 'right';
          ctx.fillText(truncate(ctx, label, 110), 0, 0);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(truncate(ctx, label, 80), x, plot.bottom + 10);
        }
        ctx.restore();
      });

      datasets.forEach((ds) => {
        const points = (ds.data || []).map((raw, i) => {
          const x = labels.length > 1 ? plot.left + step * i : plot.left + plot.width / 2;
          const value = Number(raw || 0);
          const y = plot.bottom - (plot.height * value / maxValue);
          return { x, y, value, label: labels[i] ?? i };
        });
        if (!points.length) return;
        ctx.strokeStyle = firstColor(ds.borderColor, 0, firstColor(ds.backgroundColor, 0));
        ctx.lineWidth = 2;
        ctx.beginPath();
        points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();

        points.forEach((p) => {
          ctx.fillStyle = firstColor(ds.backgroundColor, 0, firstColor(ds.borderColor, 0));
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.5, 0, TAU);
          ctx.fill();
          this.hitRegions.push({
            shape: 'point', x: p.x, y: p.y, r: 8,
            label: p.label, group: ds.label || 'Count', value: p.value
          });
        });
      });
    }

    _drawCircular(type) {
      const ctx = this.ctx;
      const labels = this.config.data?.labels || [];
      const datasets = this.config.data?.datasets || [];
      if (!datasets.length || !labels.length) return;

      const legendItems = labels.map((label, i) => ({
        label,
        color: firstColor(datasets[0].backgroundColor, i)
      }));
      const legendBottom = this._legend(legendItems, 18, 10);
      const availableTop = legendBottom + 20;
      const cx = this.cssWidth / 2;
      const cy = availableTop + (this.cssHeight - availableTop) / 2;
      const outer = Math.max(25, Math.min(this.cssWidth * 0.34, (this.cssHeight - availableTop) * 0.42));
      const count = datasets.length;
      const totalThickness = type === 'doughnut' ? outer * 0.62 : outer;
      const innerBase = type === 'doughnut' ? outer * 0.38 : 0;
      const ringThickness = Math.max(8, totalThickness / Math.max(1, count));

      datasets.forEach((ds, d) => {
        const values = labels.map((_, i) => Math.max(0, Number(ds.data?.[i] || 0)));
        const total = values.reduce((a, b) => a + b, 0) || 1;
        const rOuter = outer - d * ringThickness;
        const rInner = Math.max(innerBase, rOuter - ringThickness + (count > 1 ? 2 : 0));
        let angle = -Math.PI / 2;
        values.forEach((value, i) => {
          const sweep = TAU * value / total;
          const next = angle + sweep;
          ctx.beginPath();
          ctx.arc(cx, cy, rOuter, angle, next);
          if (rInner > 0) {
            ctx.arc(cx, cy, rInner, next, angle, true);
          } else {
            ctx.lineTo(cx, cy);
          }
          ctx.closePath();
          ctx.fillStyle = firstColor(ds.backgroundColor, i);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          this.hitRegions.push({
            shape: 'arc', cx, cy, r0: rInner, r1: rOuter, a0: angle, a1: next,
            label: labels[i], group: ds.label || 'Count', value
          });
          angle = next;
        });
      });
    }

    _drawPolar() {
      const ctx = this.ctx;
      const theme = this._theme();
      const labels = this.config.data?.labels || [];
      const datasets = this.config.data?.datasets || [];
      if (!datasets.length || !labels.length) return;
      const ds = datasets[0];
      const values = labels.map((_, i) => Math.max(0, Number(ds.data?.[i] || 0)));
      const maxValue = niceMax(Math.max(1, ...values));
      const legendItems = labels.map((label, i) => ({ label, color: firstColor(ds.backgroundColor, i) }));
      const legendBottom = this._legend(legendItems, 18, 10);
      const availableTop = legendBottom + 20;
      const cx = this.cssWidth / 2;
      const cy = availableTop + (this.cssHeight - availableTop) / 2;
      const outer = Math.max(25, Math.min(this.cssWidth * 0.34, (this.cssHeight - availableTop) * 0.42));

      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        ctx.arc(cx, cy, outer * ring / 4, 0, TAU);
        ctx.stroke();
      }

      const sweep = TAU / labels.length;
      values.forEach((value, i) => {
        const r = outer * value / maxValue;
        const a0 = -Math.PI / 2 + i * sweep;
        const a1 = a0 + sweep;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a1);
        ctx.closePath();
        ctx.fillStyle = firstColor(ds.backgroundColor, i);
        ctx.fill();
        ctx.strokeStyle = firstColor(ds.borderColor, i, '#ffffff');
        ctx.lineWidth = 1;
        ctx.stroke();
        this.hitRegions.push({
          shape: 'arc', cx, cy, r0: 0, r1: r, a0, a1,
          label: labels[i], group: ds.label || 'Count', value
        });
      });
    }

    _hitTest(x, y) {
      for (let i = this.hitRegions.length - 1; i >= 0; i--) {
        const r = this.hitRegions[i];
        if (r.shape === 'rect') {
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
        } else if (r.shape === 'point') {
          if (Math.hypot(x - r.x, y - r.y) <= r.r) return r;
        } else if (r.shape === 'arc') {
          const dx = x - r.cx;
          const dy = y - r.cy;
          const radius = Math.hypot(dx, dy);
          if (radius < r.r0 || radius > r.r1) continue;
          let angle = Math.atan2(dy, dx);
          while (angle < r.a0) angle += TAU;
          let end = r.a1;
          while (end < r.a0) end += TAU;
          if (angle >= r.a0 && angle <= end) return r;
        }
      }
      return null;
    }

    _onMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = this._hitTest(x, y);
      if (!hit) {
        this.tooltip.style.display = 'none';
        this.canvas.style.cursor = 'default';
        return;
      }
      this.canvas.style.cursor = 'crosshair';
      this.tooltip.innerHTML = `<strong>${String(hit.label)}</strong><br>${String(hit.group)}: ${formatNumber(hit.value)}`;
      this.tooltip.style.display = 'block';
      const parent = this.canvas.parentElement?.getBoundingClientRect() || rect;
      const maxLeft = Math.max(8, parent.width - this.tooltip.offsetWidth - 8);
      const maxTop = Math.max(8, parent.height - this.tooltip.offsetHeight - 8);
      this.tooltip.style.left = Math.min(maxLeft, Math.max(8, x + 12)) + 'px';
      this.tooltip.style.top = Math.min(maxTop, Math.max(8, y + 12)) + 'px';
    }

    _onLeave() {
      this.tooltip.style.display = 'none';
      this.canvas.style.cursor = 'default';
    }
  }

  window.Chart = LocalChart;
})();
let metadata = null;
let chart = null;
let currentTableRows = [];

const el = (id) => document.getElementById(id);
const palette = [
  '#4f46e5', '#0891b2', '#16a34a', '#ea580c', '#be123c', '#7c3aed',
  '#0f766e', '#ca8a04', '#2563eb', '#9333ea', '#059669', '#dc2626',
  '#475569', '#c026d3', '#65a30d', '#0284c7', '#a16207', '#db2777'
];

async function getJSON(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.detail || 'Request failed');
  return payload;
}

function fillSelect(select, values, allLabel) {
  select.innerHTML = '';
  if (allLabel) {
    const option = document.createElement('option');
    option.value = '__all__';
    option.textContent = allLabel;
    select.appendChild(option);
  }
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value.id ?? value;
    option.textContent = value.label ?? value;
    option.title = value.full_label ?? value.label ?? value;
    select.appendChild(option);
  });
}

function colorFor(index, alpha = 0.82) {
  const hex = palette[index % palette.length];
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildChartData(result) {
  const chartType = el('chartTypeSelect').value;
  const circular = ['pie', 'doughnut', 'polarArea'].includes(chartType);
  return {
    labels: result.labels,
    datasets: result.datasets.map((dataset, datasetIndex) => ({
      label: dataset.label,
      data: dataset.data,
      backgroundColor: circular
        ? result.labels.map((_, i) => colorFor(i + datasetIndex * 3, 0.78))
        : colorFor(datasetIndex, 0.76),
      borderColor: circular
        ? result.labels.map((_, i) => colorFor(i + datasetIndex * 3, 1))
        : colorFor(datasetIndex, 1),
      borderWidth: 1.3,
      pointRadius: chartType === 'line' ? 3 : undefined,
      tension: chartType === 'line' ? 0.25 : undefined,
    }))
  };
}

function drawChart(result) {
  if (chart) chart.destroy();
  const requested = el('chartTypeSelect').value;
  const horizontal = requested === 'horizontalBar';
  const type = horizontal ? 'bar' : requested;
  const stacked = el('stackedToggle').checked;
  const circular = ['pie', 'doughnut', 'polarArea'].includes(type);

  chart = new Chart(el('mainChart'), {
    type,
    data: buildChartData(result),
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: result.datasets.length > 1 || circular, position: 'bottom' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y ?? ctx.parsed.x ?? ctx.raw}` } }
      },
      scales: circular ? {} : (horizontal ? {
        x: { stacked, beginAtZero: true },
        y: { stacked, ticks: { autoSkip: false } }
      } : {
        x: { stacked, ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } },
        y: { stacked, beginAtZero: true }
      })
    }
  });
}

function renderTable(rows) {
  currentTableRows = rows;
  filterTable();
}

function filterTable() {
  const query = el('tableSearch').value.trim().toLowerCase();
  const rows = currentTableRows.filter((row) =>
    !query || `${row.response} ${row.group}`.toLowerCase().includes(query)
  );
  el('resultTableBody').innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHTML(row.response)}</td>
      <td>${escapeHTML(row.group)}</td>
      <td>${row.count}</td>
      <td>${row.percent.toFixed(2)}%</td>
    </tr>`).join('');
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

async function updateVisualization() {
  const params = new URLSearchParams({
    field: el('fieldSelect').value,
    breakdown: el('breakdownSelect').value,
    department: el('departmentSelect').value,
    semester: el('semesterSelect').value,
    top_n: el('topNSelect').value,
  });
  el('applyButton').disabled = true;
  el('applyButton').textContent = 'Updating…';
  try {
    const result = await getJSON(`/api/aggregate?${params}`);
    el('chartTitle').textContent = result.field_label;
    el('filteredCount').textContent = result.filtered_total.toLocaleString();
    el('categoryCount').textContent = result.category_count.toLocaleString();
    el('chartNote').textContent = result.group_count > 1
      ? `${result.group_count} groups are being compared. Use filters if the chart becomes crowded.`
      : 'Counts are calculated after applying the selected filters.';
    drawChart(result);
    renderTable(result.table);
  } catch (error) {
    el('chartNote').textContent = error.message;
  } finally {
    el('applyButton').disabled = false;
    el('applyButton').textContent = 'Update visualization';
  }
}

async function renderMatrix() {
  const matrix = await getJSON('/api/department-semester');
  const head = el('matrixTable').querySelector('thead');
  const body = el('matrixTable').querySelector('tbody');
  head.innerHTML = `<tr><th>Department</th>${matrix.semesters.map((s) => `<th>${escapeHTML(s.replace('Semester ', 'S'))}</th>`).join('')}<th>Total</th></tr>`;

  const maxValue = Math.max(1, ...matrix.values.flat());
  body.innerHTML = matrix.departments.map((dept, i) => {
    const values = matrix.values[i];
    const total = values.reduce((a, b) => a + b, 0);
    const cells = values.map((value) => {
      const intensity = 0.06 + (value / maxValue) * 0.28;
      return `<td class="heat" style="background: rgba(79,70,229,${intensity.toFixed(3)})">${value}</td>`;
    }).join('');
    return `<tr><td>${escapeHTML(dept)}</td>${cells}<td><b>${total}</b></td></tr>`;
  }).join('');
}

function applyPresetDepartment() {
  el('fieldSelect').value = metadata.department_field_id;
  el('breakdownSelect').value = 'none';
  el('departmentSelect').value = '__all__';
  el('semesterSelect').value = '__all__';
  el('chartTypeSelect').value = 'bar';
  updateVisualization();
}

function applyPresetDeptSem() {
  el('fieldSelect').value = metadata.semester_field_id;
  el('breakdownSelect').value = 'department';
  el('departmentSelect').value = '__all__';
  el('semesterSelect').value = '__all__';
  el('chartTypeSelect').value = 'bar';
  el('stackedToggle').checked = true;
  updateVisualization();
}

async function init() {
  try {
    metadata = await getJSON('/api/meta');
    el('metricRows').textContent = metadata.total_rows.toLocaleString();
    el('metricDepartments').textContent = metadata.department_count;
    el('metricSemesters').textContent = metadata.semester_count;
    el('metricFields').textContent = metadata.field_count;
    fillSelect(el('fieldSelect'), metadata.fields);
    fillSelect(el('departmentSelect'), metadata.departments, 'All departments');
    fillSelect(el('semesterSelect'), metadata.semesters, 'All semesters');

    el('fieldSelect').value = metadata.department_field_id;
    el('dataStatus').textContent = 'CSV loaded';
    el('dataStatus').classList.add('ready');

    await Promise.all([updateVisualization(), renderMatrix()]);
  } catch (error) {
    el('dataStatus').textContent = `Error: ${error.message}`;
  }
}

el('applyButton').addEventListener('click', updateVisualization);
el('chartTypeSelect').addEventListener('change', updateVisualization);
el('stackedToggle').addEventListener('change', updateVisualization);
el('tableSearch').addEventListener('input', filterTable);
el('presetDepartment').addEventListener('click', applyPresetDepartment);
el('presetDeptSem').addEventListener('click', applyPresetDeptSem);

init();
