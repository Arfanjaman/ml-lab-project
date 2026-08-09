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
