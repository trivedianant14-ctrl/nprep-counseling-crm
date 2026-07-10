(function () {
  "use strict";

  // Fixed "today" for this prototype demo — the seed data's follow-up dates were
  // generated relative to this date, not the browser clock, so queue buckets stay stable.
  const TODAY = "2026-07-10";

  const DATA = window.SEED_DATA;

  const ALL_TAGS = ["IL", "SP", "PL", "LSC", "LTC", "SD", "SDR", "NA", "NT", "Purchased Inactive", "Active User", "Power User"];

  const state = {
    section: "queue",
    loggedInCounselorId: null,
    activeTab: "pending",
    openStudentId: null,
    graphRange: 7,
    adminView: "overview",
    assignCohort: "all",
    assignTags: [],
    assignCounselorId: "",
    selectedAssignIds: new Set(),
    manageFilterCounselor: "all",
    selectedManageIds: new Set(),
    manageBulkCounselorId: "",
    drawerAdminMode: false
  };

  const COHORT_LABELS = {
    1: "1 — Topper",
    2: "2 — Selections",
    3: "3 — Borderline",
    4: "4 — Less Probable",
    5: "5 — Not Yet Evaluable"
  };

  const TAG_PANEL_TITLES = {
    IL: "Inactive Learner — last 3 days",
    SP: "Score Plateau — last 3 tests",
    PL: "Passive Learner — last 7 days",
    LSC: "Low Syllabus Coverage",
    LTC: "Low Time Commitment — last 7 days",
    SD: "Score Decline — last 3 tests",
    SDR: "Score Drop — most recent vs. rolling avg",
    NA: "Not Analysing — solution screen time",
    NT: "No Tag — general snapshot",
    "Purchased Inactive": "Purchased Inactive — D0–D4",
    "Active User": "Active User — last 7 days",
    "Power User": "Power User — last 7 days"
  };

  // ---------- derived queue status ----------

  function callLogsForStudent(studentId) {
    return DATA.callLogs
      .filter(c => c.studentId === studentId)
      .slice()
      .sort((a, b) => (a.callDate < b.callDate ? 1 : -1)); // newest first
  }

  function derivedStatus(studentId) {
    const logs = callLogsForStudent(studentId);
    if (logs.length === 0) return "pending";
    const latest = logs[0];
    if (!latest.followUpDate) return "completed";
    if (latest.followUpDate === TODAY) return "today";
    if (latest.followUpDate > TODAY) return "upcoming";
    return "completed"; // follow-up date in the past with no new log — treat as lapsed/completed
  }

  function assignmentsForCounselor(counselorId) {
    return DATA.assignments.filter(a => a.counselorId === counselorId);
  }

  function assignmentForStudent(studentId) {
    return DATA.assignments.find(a => a.studentId === studentId);
  }

  function studentById(id) {
    return DATA.students.find(s => s.id === id);
  }

  function counselorById(id) {
    return DATA.counselors.find(c => c.id === id);
  }

  // ---------- init / nav ----------

  function init() {
    bindNav();
    bindDrawer();
    bindLoginForm();
    render();
  }

  function bindNav() {
    document.getElementById("productNav").addEventListener("click", e => {
      const btn = e.target.closest("button[data-section]");
      if (!btn) return;
      state.section = btn.dataset.section;
      document.querySelectorAll("#productNav button").forEach(b => b.classList.toggle("active", b === btn));
      render();
    });

    document.getElementById("adminTabs").addEventListener("click", e => {
      const btn = e.target.closest("button[data-admin-view]");
      if (!btn) return;
      state.adminView = btn.dataset.adminView;
      renderAdmin();
    });
  }

  function render() {
    const showLogin = state.section === "queue" && !state.loggedInCounselorId;
    document.getElementById("loginSection").hidden = !showLogin;
    document.getElementById("queueSection").hidden = !(state.section === "queue" && state.loggedInCounselorId);
    document.getElementById("adminSection").hidden = state.section !== "admin";

    renderHeaderUser();

    if (showLogin) {
      renderLoginHint();
    } else if (state.section === "queue") {
      renderQueue();
    } else {
      renderAdmin();
    }
  }

  function renderHeaderUser() {
    const cluster = document.getElementById("userCluster");
    if (state.loggedInCounselorId) {
      const c = counselorById(state.loggedInCounselorId);
      cluster.innerHTML = `
        <div class="logged-in-cluster">
          <strong>${c.name}</strong>
          <button class="ghost" id="logoutBtn">Log out</button>
        </div>`;
      document.getElementById("logoutBtn").addEventListener("click", () => {
        state.loggedInCounselorId = null;
        state.section = "queue";
        document.querySelectorAll("#productNav button").forEach(b =>
          b.classList.toggle("active", b.dataset.section === "queue")
        );
        render();
      });
    } else {
      cluster.innerHTML = "";
    }
  }

  // ---------- counselor login (7.4) ----------

  function bindLoginForm() {
    const form = document.getElementById("loginForm");
    form.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = (fd.get("email") || "").trim().toLowerCase();
      const password = fd.get("password") || "";
      const match = DATA.counselors.find(
        c => c.email.toLowerCase() === email && c.password === password
      );
      const errorEl = document.getElementById("loginError");
      if (!match) {
        errorEl.textContent = "Invalid email or password.";
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      form.reset();
      state.loggedInCounselorId = match.id;
      state.activeTab = "pending";
      render();
    });
  }

  function renderLoginHint() {
    const demo = DATA.counselors[0];
    document.getElementById("loginDemoHint").textContent = demo
      ? `Demo login: ${demo.email} / ${demo.password}`
      : "";
  }

  // ---------- counselor: call queue (7.5) ----------

  const TAB_DEFS = [
    { key: "pending", label: "Pending" },
    { key: "today", label: "Today's follow-ups" },
    { key: "upcoming", label: "Upcoming follow-ups" },
    { key: "completed", label: "Completed" }
  ];

  function queueRowsByStatus(counselorId) {
    const buckets = { pending: [], today: [], upcoming: [], completed: [] };
    assignmentsForCounselor(counselorId).forEach(a => {
      const status = derivedStatus(a.studentId);
      buckets[status].push(a.studentId);
    });
    return buckets;
  }

  function renderQueue() {
    const counselor = counselorById(state.loggedInCounselorId);
    document.getElementById("queueTitle").textContent = `Call Queue — ${counselor.name}`;

    const buckets = queueRowsByStatus(state.loggedInCounselorId);

    renderStats(buckets);
    renderTabs(buckets);
    renderTable(buckets[state.activeTab]);
  }

  function renderStats(buckets) {
    const defs = [
      { key: "pending", label: "Pending", cls: "" },
      { key: "today", label: "Today's follow-ups", cls: "amber" },
      { key: "upcoming", label: "Upcoming", cls: "blue" },
      { key: "completed", label: "Completed", cls: "green" }
    ];
    document.getElementById("statsRow").innerHTML = defs
      .map(
        d => `
      <button class="stat-card ${d.cls} ${state.activeTab === d.key ? "active" : ""}" data-tab="${d.key}">
        <span>${d.label}</span>
        <strong>${buckets[d.key].length}</strong>
      </button>`
      )
      .join("");
    document.querySelectorAll(".stat-card").forEach(el =>
      el.addEventListener("click", () => {
        state.activeTab = el.dataset.tab;
        renderQueue();
      })
    );
  }

  function renderTabs(buckets) {
    document.getElementById("queueTabs").innerHTML = TAB_DEFS.map(
      t => `
      <button class="${state.activeTab === t.key ? "active" : ""}" data-tab="${t.key}">
        ${t.label}<span class="count">${buckets[t.key].length}</span>
      </button>`
    ).join("");
    document.querySelectorAll("#queueTabs button").forEach(el =>
      el.addEventListener("click", () => {
        state.activeTab = el.dataset.tab;
        renderQueue();
      })
    );
    document.getElementById("tableTitle").textContent = TAB_DEFS.find(t => t.key === state.activeTab).label;
    const subtitles = {
      pending: "Assigned students awaiting first contact.",
      today: "Follow-up scheduled for today — call these first.",
      upcoming: "Follow-up scheduled for a future date.",
      completed: "Latest call closed out with no follow-up needed."
    };
    document.getElementById("tableSubtitle").textContent = subtitles[state.activeTab];
  }

  function renderTable(studentIds) {
    const tbody = document.getElementById("queueTable");
    if (studentIds.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No students in this bucket.</td></tr>`;
      return;
    }
    tbody.innerHTML = studentIds
      .map(id => {
        const s = studentById(id);
        const logs = callLogsForStudent(id);
        const last = logs[0];
        return `
        <tr data-student="${s.id}">
          <td>${s.name}</td>
          <td><span class="badge cohort-${s.cohort}">${COHORT_LABELS[s.cohort]}</span></td>
          <td><div class="tag-list">${s.tags.map(t => `<span class="badge tag-badge">${t}</span>`).join("") || '<span class="muted">—</span>'}</div></td>
          <td>${last ? last.callDate : '<span class="muted">Never</span>'}</td>
          <td>${last && last.followUpDate ? last.followUpDate : '<span class="muted">—</span>'}</td>
        </tr>`;
      })
      .join("");
    tbody.querySelectorAll("tr[data-student]").forEach(tr =>
      tr.addEventListener("click", () => openDrawer(tr.dataset.student))
    );
  }

  // ---------- admin ----------

  function renderAdmin() {
    const titles = {
      overview: "Assignment Overview",
      assign: "Assign Leads",
      manage: "Manage Assignments",
      onboard: "Onboard Counselor"
    };
    document.getElementById("adminTitle").textContent = titles[state.adminView];
    document.querySelectorAll("#adminTabs button").forEach(b =>
      b.classList.toggle("active", b.dataset.adminView === state.adminView)
    );
    document.getElementById("adminOverviewView").hidden = state.adminView !== "overview";
    document.getElementById("adminAssignView").hidden = state.adminView !== "assign";
    document.getElementById("adminManageView").hidden = state.adminView !== "manage";
    document.getElementById("adminOnboardView").hidden = state.adminView !== "onboard";

    if (state.adminView === "overview") renderAdminOverview();
    if (state.adminView === "assign") renderAdminAssign();
    if (state.adminView === "manage") renderAdminManage();
    if (state.adminView === "onboard") renderAdminOnboard();
  }

  // ---- 7.3 Assignment Overview ----

  function renderAdminOverview() {
    const rows = DATA.counselors.map(c => {
      const buckets = queueRowsByStatus(c.id);
      const total = assignmentsForCounselor(c.id).length;
      return `
        <tr>
          <td>${c.name}</td>
          <td>${total}</td>
          <td>${buckets.pending.length}</td>
          <td>${buckets.today.length}</td>
          <td>${buckets.upcoming.length}</td>
          <td>${buckets.completed.length}</td>
        </tr>`;
    });
    document.getElementById("adminTable").innerHTML = rows.join("");
  }

  // ---- 7.2 Assign Leads ----

  function matchedStudents() {
    return DATA.students.filter(s => {
      const cohortOk = state.assignCohort === "all" || s.cohort === Number(state.assignCohort);
      const tagOk = state.assignTags.length === 0 || s.tags.some(t => state.assignTags.includes(t));
      return cohortOk && tagOk;
    });
  }

  function renderAdminAssign() {
    document.getElementById("assignFilters").innerHTML = `
      <div class="field">
        <label>Cohort</label>
        <select id="assignCohortSelect">
          <option value="all">All cohorts</option>
          ${[1, 2, 3, 4, 5].map(c => `<option value="${c}" ${String(state.assignCohort) === String(c) ? "selected" : ""}>${COHORT_LABELS[c]}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Tags (any of)</label>
        <div class="tag-chip-select" id="assignTagChips">
          ${ALL_TAGS.map(t => `<button type="button" class="tag-chip ${state.assignTags.includes(t) ? "active" : ""}" data-tag="${t}">${t}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>Assign selected to</label>
        <select id="assignCounselorSelect">
          <option value="">Select counselor…</option>
          ${DATA.counselors.map(c => `<option value="${c.id}" ${state.assignCounselorId === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </div>
    `;

    document.getElementById("assignCohortSelect").addEventListener("change", e => {
      state.assignCohort = e.target.value;
      state.selectedAssignIds.clear();
      renderAdminAssignSummaryAndTable();
    });
    document.getElementById("assignTagChips").addEventListener("click", e => {
      const chip = e.target.closest("button[data-tag]");
      if (!chip) return;
      const tag = chip.dataset.tag;
      const idx = state.assignTags.indexOf(tag);
      if (idx === -1) {
        state.assignTags.push(tag);
      } else {
        state.assignTags.splice(idx, 1);
      }
      chip.classList.toggle("active");
      state.selectedAssignIds.clear();
      renderAdminAssignSummaryAndTable();
    });
    document.getElementById("assignCounselorSelect").addEventListener("change", e => {
      state.assignCounselorId = e.target.value;
      renderAssignBulkBar(); // just the button state, no need to rebuild rows
    });

    const selectAll = document.getElementById("assignSelectAllCheckbox");
    if (!selectAll.dataset.bound) {
      selectAll.dataset.bound = "true";
      selectAll.addEventListener("change", e => {
        const matches = matchedStudents().filter(s => !assignmentForStudent(s.id));
        if (e.target.checked) {
          matches.forEach(s => state.selectedAssignIds.add(s.id));
        } else {
          matches.forEach(s => state.selectedAssignIds.delete(s.id));
        }
        renderAdminAssignSummaryAndTable();
      });
    }

    renderAdminAssignSummaryAndTable();
  }

  function renderAssignBulkBar() {
    const matches = matchedStudents();
    const selectable = matches.filter(s => !assignmentForStudent(s.id));
    const alreadyAssignedCount = matches.length - selectable.length;
    const selectedCount = selectable.filter(s => state.selectedAssignIds.has(s.id)).length;
    const counselor = counselorById(state.assignCounselorId);

    document.getElementById("assignSummary").innerHTML = `
      <span><strong>${matches.length}</strong> students match</span>
      <span class="muted">${alreadyAssignedCount} already assigned</span>
      <span class="muted"><strong>${selectedCount}</strong> selected</span>
      <button class="primary" id="assignBtn" ${!counselor || selectedCount === 0 ? "disabled" : ""}>Assign selected</button>
    `;

    const btn = document.getElementById("assignBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const toAssign = selectable.filter(s => state.selectedAssignIds.has(s.id));
        toAssign.forEach(s => {
          DATA.assignments.push({
            id: `a${DATA.assignments.length + 1}`,
            studentId: s.id,
            counselorId: state.assignCounselorId,
            assignedDate: TODAY
          });
        });
        showToast(`Assigned ${toAssign.length} student(s) to ${counselor.name}.`);
        state.selectedAssignIds.clear();
        renderAdminAssignSummaryAndTable();
      });
    }

    const selectAll = document.getElementById("assignSelectAllCheckbox");
    selectAll.checked = selectable.length > 0 && selectedCount === selectable.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
  }

  function renderAdminAssignSummaryAndTable() {
    const matches = matchedStudents();

    renderAssignBulkBar();

    const tbody = document.getElementById("assignMatchTable");
    if (matches.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No students match these filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = matches
      .map(s => {
        const existing = assignmentForStudent(s.id);
        const existingCounselor = existing ? counselorById(existing.counselorId) : null;
        return `
        <tr>
          <td><input type="checkbox" data-select-assign="${s.id}" ${state.selectedAssignIds.has(s.id) ? "checked" : ""} ${existing ? "disabled" : ""} /></td>
          <td>${s.name}</td>
          <td><span class="badge cohort-${s.cohort}">${COHORT_LABELS[s.cohort]}</span></td>
          <td><div class="tag-list">${s.tags.map(t => `<span class="badge tag-badge">${t}</span>`).join("") || '<span class="muted">—</span>'}</div></td>
          <td>${existingCounselor ? existingCounselor.name : '<span class="muted">Unassigned</span>'}</td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll("input[data-select-assign]").forEach(cb => {
      cb.addEventListener("change", e => {
        const id = e.target.dataset.selectAssign;
        if (e.target.checked) state.selectedAssignIds.add(id);
        else state.selectedAssignIds.delete(id);
        renderAssignBulkBar();
      });
    });
  }

  // ---- Manage Assignments (reassign existing students to a different counselor) ----

  function reassignStudent(studentId, newCounselorId) {
    const assignment = assignmentForStudent(studentId);
    if (!assignment) return;
    assignment.counselorId = newCounselorId;
  }

  function visibleManageAssignments() {
    return DATA.assignments
      .filter(a => state.manageFilterCounselor === "all" || a.counselorId === state.manageFilterCounselor)
      .map(a => ({ assignment: a, student: studentById(a.studentId) }));
  }

  function renderAdminManage() {
    document.getElementById("manageFilters").innerHTML = `
      <div class="field">
        <label>Filter by current counselor</label>
        <select id="manageFilterSelect">
          <option value="all">All counselors</option>
          ${DATA.counselors.map(c => `<option value="${c.id}" ${state.manageFilterCounselor === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </div>
    `;
    document.getElementById("manageFilterSelect").addEventListener("change", e => {
      state.manageFilterCounselor = e.target.value;
      state.selectedManageIds.clear();
      renderManageTable();
    });

    const selectAll = document.getElementById("manageSelectAllCheckbox");
    if (!selectAll.dataset.bound) {
      selectAll.dataset.bound = "true";
      selectAll.addEventListener("change", e => {
        const visible = visibleManageAssignments();
        if (e.target.checked) {
          visible.forEach(({ student }) => state.selectedManageIds.add(student.id));
        } else {
          visible.forEach(({ student }) => state.selectedManageIds.delete(student.id));
        }
        renderManageTable();
      });
    }

    renderManageTable();
  }

  function renderManageBulkBar(visible) {
    const selectedCount = visible.filter(({ student }) => state.selectedManageIds.has(student.id)).length;
    const counselor = counselorById(state.manageBulkCounselorId);

    document.getElementById("manageBulkBar").innerHTML = `
      <span><strong>${selectedCount}</strong> selected</span>
      <select id="manageBulkCounselorSelect">
        <option value="">Reassign selected to…</option>
        ${DATA.counselors.map(c => `<option value="${c.id}" ${state.manageBulkCounselorId === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
      </select>
      <button class="primary" id="manageBulkBtn" ${!counselor || selectedCount === 0 ? "disabled" : ""}>Reassign selected</button>
    `;

    document.getElementById("manageBulkCounselorSelect").addEventListener("change", e => {
      state.manageBulkCounselorId = e.target.value;
      renderManageBulkBar(visible);
    });

    const btn = document.getElementById("manageBulkBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        const toMove = visible.filter(({ student }) => state.selectedManageIds.has(student.id));
        toMove.forEach(({ student }) => reassignStudent(student.id, state.manageBulkCounselorId));
        showToast(`Reassigned ${toMove.length} student(s) to ${counselor.name}.`);
        state.selectedManageIds.clear();
        state.manageBulkCounselorId = "";
        renderManageTable();
      });
    }
  }

  function renderManageTable() {
    const visible = visibleManageAssignments();

    renderManageBulkBar(visible);

    const selectAll = document.getElementById("manageSelectAllCheckbox");
    const selectedCount = visible.filter(({ student }) => state.selectedManageIds.has(student.id)).length;
    selectAll.checked = visible.length > 0 && selectedCount === visible.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < visible.length;

    const tbody = document.getElementById("manageTable");
    if (visible.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No assigned students match this filter.</td></tr>`;
      return;
    }
    tbody.innerHTML = visible
      .map(
        ({ assignment, student: s }) => `
        <tr>
          <td><input type="checkbox" data-select-manage="${s.id}" ${state.selectedManageIds.has(s.id) ? "checked" : ""} /></td>
          <td><button class="ticket-link" data-view-student="${s.id}">${s.name}</button></td>
          <td><span class="badge cohort-${s.cohort}">${COHORT_LABELS[s.cohort]}</span></td>
          <td><div class="tag-list">${s.tags.map(t => `<span class="badge tag-badge">${t}</span>`).join("") || '<span class="muted">—</span>'}</div></td>
          <td>
            <select class="row-reassign-select" data-reassign-student="${s.id}">
              ${DATA.counselors.map(c => `<option value="${c.id}" ${assignment.counselorId === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
            </select>
          </td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("input[data-select-manage]").forEach(cb => {
      cb.addEventListener("change", e => {
        const id = e.target.dataset.selectManage;
        if (e.target.checked) state.selectedManageIds.add(id);
        else state.selectedManageIds.delete(id);
        renderManageBulkBar(visible);
        const sa = document.getElementById("manageSelectAllCheckbox");
        const sel = visible.filter(({ student }) => state.selectedManageIds.has(student.id)).length;
        sa.checked = visible.length > 0 && sel === visible.length;
        sa.indeterminate = sel > 0 && sel < visible.length;
      });
    });

    tbody.querySelectorAll("select[data-reassign-student]").forEach(sel => {
      sel.addEventListener("change", e => {
        const studentId = e.target.dataset.reassignStudent;
        const newCounselorId = e.target.value;
        const student = studentById(studentId);
        const newCounselor = counselorById(newCounselorId);
        reassignStudent(studentId, newCounselorId);
        showToast(`Reassigned ${student.name} to ${newCounselor.name}.`);
        renderManageTable();
      });
    });

    tbody.querySelectorAll("button[data-view-student]").forEach(btn => {
      btn.addEventListener("click", () => openDrawer(btn.dataset.viewStudent, { adminMode: true }));
    });
  }

  // ---- 7.1 Onboard Counselor ----

  function renderAdminOnboard() {
    const form = document.getElementById("onboardForm");
    if (!form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", e => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = (fd.get("name") || "").trim();
        const email = (fd.get("email") || "").trim();
        const password = fd.get("password") || "";
        if (!name || !email || !password) return;
        DATA.counselors.push({
          id: `c${DATA.counselors.length + 1}`,
          name,
          email,
          password
        });
        form.reset();
        showToast(`Onboarded ${name} as a counselor.`);
        renderAdminOnboard();
      });
    }
    document.getElementById("onboardTable").innerHTML = DATA.counselors
      .map(c => `<tr><td>${c.name}</td><td>${c.email}</td><td>${c.password}</td></tr>`)
      .join("");
  }

  // ---------- drawer: student detail (7.6) ----------

  function bindDrawer() {
    document.getElementById("drawerScrim").addEventListener("click", closeDrawer);
  }

  function closeDrawer() {
    state.openStudentId = null;
    state.drawerAdminMode = false;
    document.getElementById("studentDrawer").classList.remove("open");
    document.getElementById("studentDrawer").setAttribute("aria-hidden", "true");
    document.getElementById("drawerScrim").hidden = true;
  }

  function openDrawer(studentId, opts) {
    state.openStudentId = studentId;
    state.graphRange = 7;
    state.drawerAdminMode = !!(opts && opts.adminMode);
    renderDrawer();
    document.getElementById("drawerScrim").hidden = false;
    const drawer = document.getElementById("studentDrawer");
    drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => drawer.classList.add("open"));
  }

  function renderDrawer() {
    const s = studentById(state.openStudentId);
    const drawer = document.getElementById("studentDrawer");
    const assignment = assignmentForStudent(s.id);
    const currentCounselor = assignment ? counselorById(assignment.counselorId) : null;

    drawer.innerHTML = `
      <div class="drawer-head">
        <strong>Student Detail</strong>
        <button id="drawerClose" aria-label="Close">×</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-card">
          <div class="drawer-title">
            <h2>${s.name}</h2>
            <span class="badge cohort-${s.cohort}">${COHORT_LABELS[s.cohort]}</span>
            ${s.tags.map(t => `<span class="badge tag-badge">${t}</span>`).join("")}
          </div>
          <dl class="detail-grid" style="margin-top:12px">
            <dt>Phone</dt><dd>${s.phone}</dd>
            <dt>Student ID</dt><dd>${s.id}</dd>
          </dl>
        </div>

        ${state.drawerAdminMode ? `
        <div class="drawer-card">
          <h3>Assignment</h3>
          <div class="field">
            <label>Assigned counselor</label>
            <select id="drawerReassignSelect">
              <option value="">Unassigned</option>
              ${DATA.counselors.map(c => `<option value="${c.id}" ${currentCounselor && currentCounselor.id === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
            </select>
          </div>
        </div>` : ""}

        <div class="drawer-card" id="tagPanelsCard">
          <h3>Tag-specific context</h3>
          ${s.tags.length ? s.tags.map(t => renderTagPanel(s, t)).join("") : '<p class="empty-state">No diagnostic tags — nothing flagged for this student.</p>'}
        </div>

        <div class="drawer-card">
          <div class="graph-head">
            <h3 style="margin:0">Merged activity graph</h3>
            <div class="graph-toggle" id="graphToggle">
              <button data-range="3" class="${state.graphRange === 3 ? "active" : ""}">3 days</button>
              <button data-range="7" class="${state.graphRange === 7 ? "active" : ""}">7 days</button>
            </div>
          </div>
          ${renderActivityGraph(s)}
        </div>

        <div class="drawer-card">
          <h3>Call history</h3>
          ${renderCallHistory(s.id)}
        </div>

        ${state.drawerAdminMode ? "" : `
        <div class="drawer-card">
          <h3>Log a call</h3>
          ${renderCallForm(s)}
        </div>`}
      </div>
    `;

    drawer.querySelector("#drawerClose").addEventListener("click", closeDrawer);
    drawActivityGraph(s);

    const toggle = drawer.querySelector("#graphToggle");
    if (toggle) {
      toggle.addEventListener("click", e => {
        const btn = e.target.closest("button[data-range]");
        if (!btn) return;
        state.graphRange = parseInt(btn.dataset.range, 10);
        renderDrawer();
      });
    }

    if (state.drawerAdminMode) {
      const reassignSelect = drawer.querySelector("#drawerReassignSelect");
      if (reassignSelect && assignment) {
        reassignSelect.addEventListener("change", e => {
          const newCounselorId = e.target.value;
          if (!newCounselorId) return; // unassigning from the drawer isn't supported — use Assign Leads to reassign instead
          const newCounselor = counselorById(newCounselorId);
          reassignStudent(s.id, newCounselorId);
          showToast(`Reassigned ${s.name} to ${newCounselor.name}.`);
          renderDrawer();
          if (document.getElementById("manageTable")) renderManageTable();
        });
      }
    } else {
      bindCallForm(s);
    }
  }

  // ---- tag panels (Section 8 mapping) ----

  function renderTagPanel(student, tag) {
    const title = TAG_PANEL_TITLES[tag] || tag;
    let body;

    switch (tag) {
      case "SP": {
        const last3 = student.testHistory.slice(0, 3);
        if (last3.length < 3) {
          body = emptyState();
        } else {
          const scores = last3.map(t => t.score);
          const spread = (Math.max(...scores) - Math.min(...scores)).toFixed(1);
          body = testTable(last3) + `<div class="spread-callout">Spread (max − min): <strong>${spread}%</strong></div>`;
        }
        break;
      }
      case "SD": {
        const last3 = student.testHistory.slice(0, 3);
        body = last3.length ? testTable(last3) : emptyState();
        break;
      }
      case "SDR": {
        if (student.testHistory.length < 2) {
          body = emptyState();
        } else {
          const [mostRecent, ...prior] = student.testHistory;
          const rollingAvg = prior.reduce((sum, t) => sum + t.score, 0) / prior.length;
          const delta = (mostRecent.score - rollingAvg).toFixed(1);
          const cls = delta < 0 ? "negative" : "positive";
          body = `
            <table class="mini-table">
              <thead><tr><th>Date</th><th>Score</th></tr></thead>
              <tbody>
                <tr><td>${mostRecent.date} (most recent)</td><td>${mostRecent.score}%</td></tr>
                <tr><td>Rolling avg of prior ${prior.length}</td><td>${rollingAvg.toFixed(1)}%</td></tr>
              </tbody>
            </table>
            <div class="delta-callout ${cls}">Delta: <strong>${delta > 0 ? "+" : ""}${delta}%</strong></div>`;
        }
        break;
      }
      case "NA": {
        const withSolutionTime = student.testHistory.filter(t => t.solutionScreenMinutes != null);
        body = withSolutionTime.length ? testTable(withSolutionTime, true) : emptyState("solutionScreenMinutes not tracked in current data source.");
        break;
      }
      case "LSC":
        body = `<p class="empty-state">Blocked upstream — "major subjects" list pending from content team (PRD Section 5).</p>`;
        break;
      case "IL":
      case "PL":
      case "LTC":
      case "NT":
      case "Purchased Inactive":
      case "Active User":
      case "Power User":
      default:
        body = emptyState();
        break;
    }

    return `<div class="tag-panel"><strong>${title}</strong>${body}</div>`;
  }

  function testTable(tests, showSolutionTime) {
    return `
      <table class="mini-table">
        <thead><tr><th>Date</th><th>Score</th>${showSolutionTime ? "<th>Solution screen (min)</th>" : ""}</tr></thead>
        <tbody>
          ${tests
            .map(
              t => `<tr><td>${t.date}</td><td>${t.score}%</td>${
                showSolutionTime
                  ? `<td>${t.solutionScreenMinutes}${t.solutionScreenMinutes < 60 ? " ⚠" : ""}</td>`
                  : ""
              }</tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function emptyState(msg) {
    return `<p class="empty-state">${msg || "No underlying activity data in this seed yet — awaiting live data migration (PRD Section 2)."}</p>`;
  }

  // ---- merged activity graph ----

  function renderActivityGraph(student) {
    const days = state.graphRange;
    const log = student.activityLog.slice(0, days);
    if (!log.length) {
      return `<p class="empty-state">No activityLog entries for this student yet — awaiting live data migration.</p>`;
    }
    return `<canvas id="activityCanvas" width="680" height="180"></canvas>
      <div class="graph-legend">
        <span><i style="background:#0875be"></i>MCQs attempted</span>
        <span><i style="background:#079455"></i>Video minutes</span>
        <span><i style="background:#6941c6"></i>Tests taken</span>
      </div>`;
  }

  function drawActivityGraph(student) {
    const canvas = document.getElementById("activityCanvas");
    if (!canvas) return;
    const log = student.activityLog.slice(0, state.graphRange).slice().reverse();
    if (!log.length) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(1, ...log.map(d => Math.max(d.mcqAttempted, d.videoMinutesWatched, d.testsTaken)));
    const groupWidth = w / log.length;
    const barWidth = groupWidth / 5;
    const chartHeight = h - 24;
    const colors = ["#0875be", "#079455", "#6941c6"];

    log.forEach((d, i) => {
      const values = [d.mcqAttempted, d.videoMinutesWatched, d.testsTaken];
      values.forEach((v, j) => {
        const barHeight = (v / maxVal) * chartHeight;
        const x = i * groupWidth + groupWidth / 2 - barWidth * 1.5 + j * barWidth;
        ctx.fillStyle = colors[j];
        ctx.fillRect(x, chartHeight - barHeight, barWidth - 2, barHeight);
      });
      ctx.fillStyle = "#667085";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(d.date.slice(5), i * groupWidth + groupWidth / 2, h - 6);
    });
  }

  // ---- call history + form ----

  function renderCallHistory(studentId) {
    const logs = callLogsForStudent(studentId);
    if (!logs.length) return `<p class="empty-state">No calls logged yet.</p>`;
    return logs
      .map(
        l => `
      <div class="call-history-item">
        <strong>${l.callDate}</strong> — <span class="badge ${l.status === "Answered" ? "tag-badge" : ""}" style="${l.status === "Not Answered" ? "color:#d92d20;background:#fee4e2" : ""}">${l.status}</span>
        ${l.followUpDate ? ` · follow-up ${l.followUpDate}` : ""}
        <div class="muted" style="margin-top:4px">${l.notes || ""}</div>
        ${l.tagChangeNote ? `<div class="muted" style="margin-top:2px">Tag note: ${l.tagChangeNote}</div>` : ""}
      </div>`
      )
      .join("");
  }

  function renderCallForm(student) {
    return `
      <form class="call-form" id="callForm">
        <div class="field">
          <label>Status</label>
          <div class="status-toggle" id="statusToggle">
            <button type="button" class="active" data-status="Answered">Answered</button>
            <button type="button" data-status="Not Answered">Not Answered</button>
          </div>
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea name="notes" placeholder="What was discussed..."></textarea>
        </div>
        <div class="field">
          <label>Follow-up date (optional)</label>
          <input type="date" name="followUpDate" />
        </div>
        <div class="field">
          <label>Tag-change note (optional)</label>
          <input type="text" name="tagChangeNote" placeholder="e.g. moved off IL after this call" />
        </div>
        <div class="form-actions">
          <button type="submit" class="primary">Submit call log</button>
        </div>
      </form>`;
  }

  function bindCallForm(student) {
    const form = document.getElementById("callForm");
    const toggle = document.getElementById("statusToggle");
    let status = "Answered";

    toggle.addEventListener("click", e => {
      const btn = e.target.closest("button[data-status]");
      if (!btn) return;
      status = btn.dataset.status;
      toggle.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
    });

    form.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(form);
      const newLog = {
        id: `cl${DATA.callLogs.length + 1}`,
        studentId: student.id,
        counselorId: state.loggedInCounselorId,
        callDate: TODAY,
        status,
        notes: fd.get("notes") || "",
        followUpDate: fd.get("followUpDate") || null,
        tagChangeNote: fd.get("tagChangeNote") || null
      };
      DATA.callLogs.push(newLog);
      showToast(`Call logged for ${student.name} — moved to ${TAB_DEFS.find(t => t.key === derivedStatus(student.id)).label}.`);
      renderDrawer();
      renderQueue();
    });
  }

  function showToast(msg) {
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
