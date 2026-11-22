import {
  fetchAllSubjects,
  fetchBranches,
  fetchContributors,
  fetchSettings,
  fetchYears,
  saveBranch,
  saveContributor,
  saveSettings,
  saveSubject,
  saveYear,
} from "./db.js";

const DEMO_YEARS = [
  { name: "First Year", order: 0, semesters: [1, 2] },
  { name: "Second Year", order: 1, semesters: [3, 4] },
  { name: "Third Year", order: 2, semesters: [5, 6] },
  { name: "Fourth Year", order: 3, semesters: [7, 8] },
];

const DEMO_BRANCHES = [
  { name: "Computer Science & Engineering", shortName: "CSE", color: "#DDEFD9", order: 0 },
  { name: "Information Technology", shortName: "IT", color: "#E3EEFF", order: 1 },
  { name: "Electronics & Communication", shortName: "ECE", color: "#FCE8CC", order: 2 },
  { name: "Mechanical Engineering", shortName: "ME", color: "#FADADD", order: 3 },
  { name: "Civil Engineering", shortName: "CE", color: "#E9E3FF", order: 4 },
];

const DEMO_CONTRIBUTORS = [
  { name: "Ananya Rao", role: "CSE · 2026", uploadsCount: 12, order: 0 },
  { name: "Karthik Menon", role: "ECE · 2025", uploadsCount: 9, order: 1 },
  { name: "Sara Iqbal", role: "IT · 2026", uploadsCount: 7, order: 2 },
];

const DEMO_SUBJECTS = [
  {
    name: "Engineering Mathematics I",
    code: "MA101",
    yearIndex: 0,
    semester: 1,
    branchKeys: ["CSE", "IT", "ECE", "ME", "CE"],
    color: "#E3EEFF",
    description: "Calculus, sequences, series, and the mathematical foundations every engineer needs.",
    modules: ["Differential Calculus", "Sequences and Series", "Integral Calculus", "Partial Derivatives", "Applications of Derivatives"],
  },
  {
    name: "Engineering Physics",
    code: "PH101",
    yearIndex: 0,
    semester: 1,
    branchKeys: ["CSE", "IT", "ECE", "ME", "CE"],
    color: "#DDEFD9",
    description: "Mechanics, optics, oscillations, and modern physics with lab-oriented examples.",
    modules: ["Oscillations and Waves", "Interference and Diffraction", "Quantum Basics", "Lasers and Fibre Optics", "Material Properties"],
  },
  {
    name: "Programming Fundamentals",
    code: "CS101",
    yearIndex: 0,
    semester: 1,
    branchKeys: ["CSE", "IT"],
    color: "#F0F5D9",
    description: "Start with C: variables, control flow, functions, arrays, pointers, and problem solving.",
    modules: ["Algorithms and Flowcharts", "Variables and Data Types", "Control Statements", "Functions and Recursion", "Arrays and Strings", "Pointers"],
  },
  {
    name: "Engineering Mathematics II",
    code: "MA201",
    yearIndex: 0,
    semester: 2,
    branchKeys: ["CSE", "IT", "ECE", "ME", "CE"],
    color: "#FCE8CC",
    description: "Linear algebra, differential equations, and transforms for engineering applications.",
    modules: ["Matrices and Eigenvalues", "Vector Spaces", "Ordinary Differential Equations", "Laplace Transforms", "Fourier Series"],
  },
  {
    name: "Object-Oriented Programming",
    code: "CS201",
    yearIndex: 0,
    semester: 2,
    branchKeys: ["CSE", "IT"],
    color: "#FADADD",
    description: "Classes, objects, inheritance, polymorphism, and clean program design in Java.",
    modules: ["Classes and Objects", "Constructors and Overloading", "Inheritance", "Interfaces and Abstraction", "Exception Handling", "Collections"],
  },
  {
    name: "Data Structures & Algorithms",
    code: "CS301",
    yearIndex: 1,
    semester: 3,
    branchKeys: ["CSE", "IT"],
    color: "#E9E3FF",
    description: "Core data structures, complexity analysis, searching, sorting, trees, and graphs.",
    modules: ["Complexity Analysis", "Stacks and Queues", "Linked Lists", "Trees and BSTs", "Heaps and Hashing", "Graphs and Traversals"],
  },
  {
    name: "Digital Logic Design",
    code: "EC301",
    yearIndex: 1,
    semester: 3,
    branchKeys: ["ECE", "CSE"],
    color: "#DDEFD9",
    description: "Boolean algebra, combinational circuits, sequential logic, and processor building blocks.",
    modules: ["Number Systems", "Boolean Algebra", "Combinational Circuits", "Flip-Flops", "Registers and Counters", "Memory Basics"],
  },
  {
    name: "Discrete Mathematics",
    code: "MA301",
    yearIndex: 1,
    semester: 3,
    branchKeys: ["CSE", "IT"],
    color: "#E3EEFF",
    description: "Logic, sets, relations, combinatorics, graphs, and proof techniques for computer science.",
    modules: ["Propositional Logic", "Sets and Relations", "Functions and Counting", "Graph Theory", "Recurrence Relations", "Proof Techniques"],
  },
  {
    name: "Operating Systems",
    code: "CS401",
    yearIndex: 1,
    semester: 4,
    branchKeys: ["CSE", "IT"],
    color: "#F0F5D9",
    description: "Processes, scheduling, memory, file systems, and concurrency with practical examples.",
    modules: ["Process Management", "CPU Scheduling", "Synchronization", "Deadlocks", "Memory Management", "File Systems"],
  },
  {
    name: "Database Management Systems",
    code: "CS402",
    yearIndex: 1,
    semester: 4,
    branchKeys: ["CSE", "IT"],
    color: "#FCE8CC",
    description: "Relational modelling, SQL, normalization, transactions, and indexing.",
    modules: ["ER Modelling", "Relational Algebra", "SQL Queries", "Normalization", "Transactions and Concurrency", "Indexing"],
  },
  {
    name: "Computer Networks",
    code: "CS403",
    yearIndex: 1,
    semester: 4,
    branchKeys: ["CSE", "IT", "ECE"],
    color: "#FADADD",
    description: "Layered network models, TCP/IP, routing, and the protocols behind the internet.",
    modules: ["Network Models", "Physical and Data Link Layers", "IP Addressing", "Routing Algorithms", "TCP and UDP", "Application Protocols"],
  },
  {
    name: "Design & Analysis of Algorithms",
    code: "CS501",
    yearIndex: 2,
    semester: 5,
    branchKeys: ["CSE", "IT"],
    color: "#E9E3FF",
    description: "Algorithm design paradigms, correctness, and complexity with classic problems.",
    modules: ["Divide and Conquer", "Greedy Methods", "Dynamic Programming", "Backtracking", "Branch and Bound", "NP-Completeness"],
  },
  {
    name: "Software Engineering",
    code: "CS502",
    yearIndex: 2,
    semester: 5,
    branchKeys: ["CSE", "IT"],
    color: "#DDEFD9",
    description: "Requirements, design, testing, and delivery practices for reliable software.",
    modules: ["Software Processes", "Requirements Engineering", "System Design", "Agile Planning", "Testing Strategies", "Maintenance"],
  },
  {
    name: "Web Technologies",
    code: "CS503",
    yearIndex: 2,
    semester: 5,
    branchKeys: ["CSE", "IT"],
    color: "#E3EEFF",
    description: "HTML, CSS, JavaScript, APIs, and the architecture of modern web applications.",
    modules: ["HTML and Semantics", "CSS Layout", "JavaScript Essentials", "DOM and Events", "HTTP and APIs", "Security Basics"],
  },
  {
    name: "Artificial Intelligence",
    code: "CS601",
    yearIndex: 2,
    semester: 6,
    branchKeys: ["CSE", "IT"],
    color: "#F0F5D9",
    description: "Search, knowledge representation, reasoning, and an introduction to machine learning.",
    modules: ["Intelligent Agents", "Search Strategies", "Knowledge Representation", "Reasoning Under Uncertainty", "Introduction to ML", "AI Ethics"],
  },
  {
    name: "Compiler Design",
    code: "CS602",
    yearIndex: 2,
    semester: 6,
    branchKeys: ["CSE", "IT"],
    color: "#FCE8CC",
    description: "Lexing, parsing, semantic analysis, optimization, and code generation.",
    modules: ["Lexical Analysis", "Syntax Analysis", "Semantic Analysis", "Intermediate Code", "Optimization", "Code Generation"],
  },
  {
    name: "Cloud Computing",
    code: "CS603",
    yearIndex: 2,
    semester: 6,
    branchKeys: ["CSE", "IT"],
    color: "#FADADD",
    description: "Virtualization, service models, containers, and designing for the cloud.",
    modules: ["Cloud Service Models", "Virtualization", "Containers", "Storage and Databases", "Scaling", "Cloud Security"],
  },
  {
    name: "Machine Learning",
    code: "CS701",
    yearIndex: 3,
    semester: 7,
    branchKeys: ["CSE", "IT"],
    color: "#E9E3FF",
    description: "Supervised and unsupervised learning, model evaluation, and practical workflows.",
    modules: ["Regression", "Classification", "Decision Trees", "Clustering", "Model Evaluation", "Neural Network Basics"],
  },
  {
    name: "Information Security",
    code: "CS702",
    yearIndex: 3,
    semester: 7,
    branchKeys: ["CSE", "IT"],
    color: "#DDEFD9",
    description: "Cryptography, authentication, secure systems, and threat modelling.",
    modules: ["Security Fundamentals", "Symmetric Cryptography", "Public-Key Cryptography", "Authentication", "Web Security", "Risk Management"],
  },
  {
    name: "Mobile Application Development",
    code: "CS703",
    yearIndex: 3,
    semester: 7,
    branchKeys: ["CSE", "IT"],
    color: "#E3EEFF",
    description: "Build mobile interfaces, manage state, and connect apps to backend services.",
    modules: ["Mobile Platforms", "Layouts and Navigation", "State Management", "Networking", "Local Storage", "Publishing"],
  },
  {
    name: "Distributed Systems",
    code: "CS801",
    yearIndex: 3,
    semester: 8,
    branchKeys: ["CSE", "IT"],
    color: "#F0F5D9",
    description: "Consistency, replication, fault tolerance, and coordination across machines.",
    modules: ["System Models", "Communication", "Replication", "Consistency Models", "Fault Tolerance", "Distributed Algorithms"],
  },
  {
    name: "Major Project",
    code: "CS802",
    yearIndex: 3,
    semester: 8,
    branchKeys: ["CSE", "IT"],
    color: "#FCE8CC",
    description: "Plan, build, document, and present a complete capstone project.",
    modules: ["Problem Definition", "Literature Review", "System Design", "Implementation", "Testing and Validation", "Report and Presentation"],
  },
];

export async function seedDemoData() {
  const [existingSubjects, existingYears, existingBranches, existingContributors, settings] = await Promise.all([
    fetchAllSubjects(),
    fetchYears(),
    fetchBranches(),
    fetchContributors(),
    fetchSettings(),
  ]);
  if (existingSubjects.length) {
    throw new Error("Demo content is only available when the catalog is empty.");
  }

  const years = existingYears.length ? [...existingYears] : [];
  if (!years.length) {
    for (const year of DEMO_YEARS) {
      const id = await saveYear(null, year);
      years.push({ ...year, id });
    }
  }

  const branches = existingBranches.length ? [...existingBranches] : [];
  if (!branches.length) {
    for (const branch of DEMO_BRANCHES) {
      const id = await saveBranch(null, { ...branch, icon: "graduation-cap" });
      branches.push({ ...branch, id });
    }
  }

  const branchByShortName = new Map(branches.map((branch) => [String(branch.shortName || "").toUpperCase(), branch]));
  const branchByIndex = branches;
  const yearBySemester = (semester) => years.find((year) => (year.semesters || []).includes(semester)) || years[Math.min(Math.floor((semester - 1) / 2), years.length - 1)] || years[0];

  for (const subject of DEMO_SUBJECTS) {
    const year = yearBySemester(subject.semester);
    if (!year) continue;
    const branchIds = subject.branchKeys
      .map((key) => branchByShortName.get(key))
      .filter(Boolean)
      .map((branch) => branch.id);
    if (!branchIds.length) {
      const fallback = branchByIndex[subject.yearIndex] || branchByIndex[0];
      if (fallback) branchIds.push(fallback.id);
    }
    if (!branchIds.length) continue;
    await saveSubject(null, {
      name: subject.name,
      code: subject.code,
      yearId: year.id,
      semester: subject.semester,
      branchIds,
      description: subject.description,
      color: subject.color,
      icon: "book-open",
      modules: subject.modules,
      order: DEMO_SUBJECTS.indexOf(subject),
    });
  }

  if (!existingContributors.length) {
    for (const contributor of DEMO_CONTRIBUTORS) {
      await saveContributor(null, { ...contributor, photoURL: "", link: "" });
    }
  }

  if (!settings.aboutText || !settings.contactEmail || !settings.announcement) {
    await saveSettings({
      aboutText: settings.aboutText || "Academix keeps every semester's notes in one calm, fast library. Browse subjects, open view-only PDFs, and track the modules you have finished. Built by students, for students.",
      contactEmail: settings.contactEmail || "notes@Academix.app",
      announcement: settings.announcement || "Welcome to Academix. Pick your year and branch to see the notes for your semester.",
    });
  }

  return { years: years.length, branches: branches.length, subjects: DEMO_SUBJECTS.length };
}
