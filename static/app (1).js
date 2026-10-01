/* =========================================================
   GradeTrack — Application JavaScript
   ========================================================= */

let currentStudent = null;
let currentRole = "student";
let currentChart = null;
let historyChart = null;

/* =========================================================
   Helpers
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, duration = 3000) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data = {};

  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function setHidden(element, hidden) {
  if (!element) return;

  element.classList.toggle("hidden", hidden);
}

/* =========================================================
   Role selection
   ========================================================= */

function selectRole(role) {
  currentRole = role;

  document.querySelectorAll(".role").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.role === role
    );
  });

  setHidden(
    $("studentAuth"),
    role !== "student"
  );

  setHidden(
    $("parentAuth"),
    role !== "parent"
  );
}

/* =========================================================
   Demo
   ========================================================= */

function useDemo() {
  if (currentRole === "parent") {
    const input = $("parentCode");

    if (input) {
      input.value = "DEMO-2026";
      input.focus();
    }
  } else {
    const input = $("studentCode");

    if (input) {
      input.value = "DEMO-2026";
      input.focus();
    }
  }
}

/* =========================================================
   Authentication
   ========================================================= */

async function authenticate() {
  const input =
    currentRole === "parent"
      ? $("parentCode")
      : $("studentCode");

  const code = input ? input.value.trim() : "";

  if (!code) {
    showToast("Enter a student code.");
    if (input) input.focus();
    return;
  }

  try {
    const data = await api("/api/auth", {
      method: "POST",
      body: JSON.stringify({
        code: code
      })
    });

    openDashboard(data);
  } catch (error) {
    showToast(error.message);
  }
}

async function createStudent() {
  const nameInput = $("newName");
  const codeInput = $("newCode");

  const name = nameInput ? nameInput.value.trim() : "";
  const code = codeInput ? codeInput.value.trim() : "";

  if (name.length < 2) {
    showToast("Enter the student's name.");
    if (nameInput) nameInput.focus();
    return;
  }

  if (code.length < 4) {
    showToast("Student code must be at least 4 characters.");
    if (codeInput) codeInput.focus();
    return;
  }

  try {
    const data = await api("/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: name,
        code: code
      })
    });

    openDashboard(data);
    showToast("Student profile created.");
  } catch (error) {
    showToast(error.message);
  }
}

/* =========================================================
   Dashboard
   ========================================================= */

function openDashboard(student) {
  currentStudent = student;

  setHidden($("landing"), true);
  setHidden($("app"), false);
  setHidden($("userArea"), false);

  updateProfile();

  showView("overview");
  renderDashboard();
}

function updateProfile() {
  if (!currentStudent) return;

  const name = currentStudent.name || "Student";
  const code = currentStudent.code || "";

  if ($("userName")) {
    $("userName").textContent = name;
  }

  if ($("sideName")) {
    $("sideName").textContent = name;
  }

  if ($("sideCode")) {
    $("sideCode").textContent = code;
  }

  if ($("avatar")) {
    $("avatar").textContent =
      name.charAt(0).toUpperCase();
  }

  if ($("welcomeText")) {
    $("welcomeText").textContent =
      `Here is ${name}'s latest grade progress.`;
  }

  /*
   * Students can view grades.
   * Parent users can add notes.
   */
  const notesComposer = $("notesComposer");

  if (notesComposer) {
    setHidden(
      notesComposer,
      currentRole !== "parent"
    );
  }

  const addGradeButton = $("addGradeButton");

  if (addGradeButton) {
    setHidden(
      addGradeButton,
      currentRole !== "student"
    );
  }
}

/* =========================================================
   Navigation
   ========================================================= */

function showView(viewName) {
  const views = [
    "overview",
    "history",
    "notes"
  ];

  views.forEach(name => {
    const view = $(`${name}View`);

    if (view) {
      setHidden(view, name !== viewName);
    }
  });

  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });

  if (viewName === "history") {
    renderHistory();
  }

  if (viewName === "notes") {
    renderNotes();
  }
}

/* =========================================================
   Dashboard rendering
   ========================================================= */

function renderDashboard() {
  if (!currentStudent) return;

  renderAverage();
  renderLatestGrades();
  renderCurrentChart();
  renderHistoryChart();
  renderHistory();
  renderNotes();
  updateProfile();
}

function renderAverage() {
  const grades = currentStudent.grades || [];

  const averageElement = $("average");

  if (!averageElement) return;

  if (!grades.length) {
    averageElement.textContent = "—";
    return;
  }

  const total = grades.reduce(
    (sum, grade) =>
      sum + Number(grade.percentage || 0),
    0
  );

  const average = total / grades.length;

  averageElement.textContent =
    `${average.toFixed(1)}%`;
}

/* =========================================================
   Latest grades
   ========================================================= */

function renderLatestGrades() {
  const container = $("latestGrades");

  if (!container || !currentStudent) return;

  const grades = [...(currentStudent.grades || [])]
    .sort((a, b) => {
      return new Date(b.recorded_at) -
             new Date(a.recorded_at);
    });

  if (!grades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No grades yet</strong>
        Add your first result to start tracking progress.
      </div>
    `;
    return;
  }

  container.innerHTML = grades
    .slice(0, 6)
    .map(grade => {
      const percentage =
        Number(grade.percentage || 0);

      return `
        <div class="grade-item">
          <div class="grade-main">
            <span class="grade-subject">
              ${escapeHTML(grade.subject)}
            </span>

            <span class="grade-meta">
              ${Number(grade.grade)} / ${Number(grade.max_grade)}
              · ${formatDate(grade.recorded_at)}
            </span>
          </div>

          <span class="grade-percent">
            ${percentage.toFixed(1)}%
          </span>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   Current performance chart
   ========================================================= */

function renderCurrentChart() {
  const canvas = $("currentChart");

  if (!canvas || !currentStudent) return;

  const grades = currentStudent.grades || [];

  const latestBySubject = {};

  grades.forEach(grade => {
    latestBySubject[grade.subject] = grade;
  });

  const subjects = Object.keys(latestBySubject);

  const values = subjects.map(subject =>
    Number(latestBySubject[subject].percentage || 0)
  );

  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }

  if (typeof Chart === "undefined") {
    return;
  }

  currentChart = new Chart(canvas, {
    type: "bar",

    data: {
      labels: subjects,

      datasets: [
        {
          label: "Percentage",

          data: values,

          borderWidth: 1,

          borderRadius: 7
        }
      ]
    },

    options: {
      responsive: true,

      maintainAspectRatio: false,

      scales: {
        y: {
          beginAtZero: true,
          max: 100,

          ticks: {
            callback: value => `${value}%`
          }
        }
      },

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          callbacks: {
            label: context =>
              `${context.parsed.y}%`
          }
        }
      }
    }
  });
}

/* =========================================================
   History chart
   ========================================================= */

function renderHistoryChart() {
  const canvas = $("historyChart");

  if (!canvas || !currentStudent) return;

  const grades = currentStudent.grades || [];

  if (historyChart) {
    historyChart.destroy();
    historyChart = null;
  }

  if (typeof Chart === "undefined") {
    return;
  }

  if (!grades.length) {
    return;
  }

  const subjects = [
    ...new Set(
      grades.map(grade => grade.subject)
    )
  ];

  const datasets = subjects.map(subject => {
    const subjectGrades = grades
      .filter(grade => grade.subject === subject)
      .sort((a, b) =>
        new Date(a.recorded_at) -
        new Date(b.recorded_at)
      );

    return {
      label: subject,

      data: subjectGrades.map(grade => ({
        x: formatShortDate(grade.recorded_at),
        y: Number(grade.percentage || 0)
      })),

      tension: 0.3,

      borderWidth: 2,

      pointRadius: 4
    };
  });

  historyChart = new Chart(canvas, {
    type: "line",

    data: {
      datasets: datasets
    },

    options: {
      responsive: true,

      maintainAspectRatio: false,

      interaction: {
        mode: "nearest",
        intersect: false
      },

      scales: {
        x: {
          type: "category"
        },

        y: {
          beginAtZero: true,
          max: 100,

          ticks: {
            callback: value => `${value}%`
          }
        }
      }
    }
  });
}

/* =========================================================
   History table
   ========================================================= */

function renderHistory() {
  const container = $("historyTable");

  if (!container || !currentStudent) return;

  const grades = [...(currentStudent.grades || [])]
    .sort((a, b) => {
      return new Date(b.recorded_at) -
             new Date(a.recorded_at);
    });

  if (!grades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No grade history</strong>
        Your recorded grades will appear here.
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Subject</th>
          <th>Score</th>
          <th>Percentage</th>
          <th>Date</th>
        </tr>
      </thead>

      <tbody>
        ${grades.map(grade => `
          <tr>
            <td>
              <strong>
                ${escapeHTML(grade.subject)}
              </strong>
            </td>

            <td>
              ${Number(grade.grade)}
              /
              ${Number(grade.max_grade)}
            </td>

            <td>
              <strong>
                ${Number(grade.percentage).toFixed(1)}%
              </strong>
            </td>

            <td>
              ${formatDate(grade.recorded_at)}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* =========================================================
   Notes
   ========================================================= */

function renderNotes() {
  const container = $("notesList");

  if (!container || !currentStudent) return;

  const notes = currentStudent.notes || [];

  if (!notes.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No notes yet</strong>
        Saved progress notes will appear here.
      </div>
    `;

    return;
  }

  container.innerHTML = notes.map(note => `
    <div class="note-item">

      <strong>
        ${escapeHTML(
          note.subject || "General note"
        )}
      </strong>

      <p>
        ${escapeHTML(note.note)}
      </p>

      ${
        note.period
          ? `
            <div class="note-meta">
              ${escapeHTML(note.period)}
              ·
              ${formatDate(note.created_at)}
            </div>
          `
          : `
            <div class="note-meta">
              ${formatDate(note.created_at)}
            </div>
          `
      }

    </div>
  `).join("");
}

async function addNote() {
  const subject =
    $("noteSubject")?.value.trim() || "";

  const period =
    $("notePeriod")?.value.trim() || "";

  const note =
    $("noteText")?.value.trim() || "";

  if (!note) {
    showToast("Write a note first.");

    if ($("noteText")) {
      $("noteText").focus();
    }

    return;
  }

  try {
    await api("/api/notes", {
      method: "POST",

      body: JSON.stringify({
        subject: subject,
        period: period,
        note: note
      })
    });

    $("noteSubject").value = "";
    $("notePeriod").value = "";
    $("noteText").value = "";

    await refreshStudent();

    showToast("Note saved.");
  } catch (error) {
    showToast(error.message);
  }
}

/* =========================================================
   Grade modal
   ========================================================= */

function openGradeModal() {
  if (currentRole !== "student") {
    showToast("Only students can add grades.");
    return;
  }

  const modal = $("gradeModal");

  if (!modal) return;

  setHidden(modal, false);

  if ($("gradeSubject")) {
    $("gradeSubject").focus();
  }

  previewPercentage();
}

function closeGradeModal() {
  const modal = $("gradeModal");

  if (!modal) return;

  setHidden(modal, true);
}

function previewPercentage() {
  const grade =
    parseFloat($("gradeValue")?.value);

  const maximum =
    parseFloat($("maxValue")?.value);

  const preview = $("pctPreview");

  if (!preview) return;

  if (
    !Number.isFinite(grade) ||
    !Number.isFinite(maximum) ||
    maximum <= 0
  ) {
    preview.textContent = "0%";
    return;
  }

  const percentage =
    (grade / maximum) * 100;

  preview.textContent =
    `${percentage.toFixed(1)}%`;
}

async function saveGrade() {
  const subject =
    $("gradeSubject")?.value.trim() || "";

  const grade =
    parseFloat($("gradeValue")?.value);

  const maximum =
    parseFloat($("maxValue")?.value);

  if (!subject) {
    showToast("Enter a subject.");
    $("gradeSubject")?.focus();
    return;
  }

  if (!Number.isFinite(grade)) {
    showToast("Enter the points earned.");
    $("gradeValue")?.focus();
    return;
  }

  if (!Number.isFinite(maximum) || maximum <= 0) {
    showToast("Enter the points possible.");
    $("maxValue")?.focus();
    return;
  }

  if (grade < 0 || grade > maximum) {
    showToast(
      "Points earned must be between 0 and the maximum."
    );
    return;
  }

  try {
    await api("/api/grades", {
      method: "POST",

      body: JSON.stringify({
        subject: subject,
        grade: grade,
        max_grade: maximum
      })
    });

    closeGradeModal();

    $("gradeSubject").value = "";
    $("gradeValue").value = "";
    $("maxValue").value = "100";

    previewPercentage();

    await refreshStudent();

    showToast("Grade saved.");
  } catch (error) {
    showToast(error.message);
  }
}

/* =========================================================
   Refresh current student
   ========================================================= */

async function refreshStudent() {
  try {
    const data = await api("/api/data");

    currentStudent = data;

    renderDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

/* =========================================================
   Logout
   ========================================================= */

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch (_) {
    // Even if the request fails, return to the login screen.
  }

  currentStudent = null;

  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }

  if (historyChart) {
    historyChart.destroy();
    historyChart = null;
  }

  setHidden($("app"), true);
  setHidden($("landing"), false);
  setHidden($("userArea"), true);

  closeGradeModal();

  selectRole("student");

  if ($("studentCode")) {
    $("studentCode").value = "";
  }

  if ($("parentCode")) {
    $("parentCode").value = "";
  }

  if ($("newName")) {
    $("newName").value = "";
  }

  if ($("newCode")) {
    $("newCode").value = "";
  }

  showToast("Logged out.");
}

/* =========================================================
   Dates
   ========================================================= */

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatShortDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

/* =========================================================
   Keyboard shortcuts
   ========================================================= */

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeGradeModal();
  }
});

document.addEventListener("click", event => {
  const modal = $("gradeModal");

  if (
    modal &&
    event.target === modal
  ) {
    closeGradeModal();
  }
});

/* =========================================================
   Startup
   ========================================================= */

async function initializeApp() {
  selectRole("student");

  try {
    const data = await api("/api/me");

    if (data.authenticated && data.student) {
      openDashboard(data.student);
    }
  } catch (error) {
    console.error(
      "GradeTrack startup error:",
      error
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);
