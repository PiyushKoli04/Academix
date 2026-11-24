/**
 * Academix SEO Static Page Generator
 *
 * Connects to Firestore via Firebase Admin SDK, fetches all subjects,
 * years, branches, documents, contributors and settings, then generates:
 *   - /notes/{subject-slug}/index.html for each eligible subject
 *   - /notes/index.html (notes landing page)
 *   - /sitemap.xml
 *   - /robots.txt
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='{ ... }' node generate.js
 *   — or —
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node generate.js
 */

'use strict';

let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  admin = null;
}
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOMAIN = 'https://academix.syntaxsyndicate.co.in';
const OG_IMAGE = `${DOMAIN}/icons/og.png?v=2`;
const ROOT_DIR = path.resolve(__dirname, '..');
const NOTES_DIR = path.join(ROOT_DIR, 'notes');

// ---------------------------------------------------------------------------
// Firebase Initialization
// ---------------------------------------------------------------------------

function initFirebase() {
  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
      admin.initializeApp({ credential });
      return admin.firestore();
    } catch (err) {
      console.error('ERROR: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err.message);
      process.exit(1);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      credential = admin.credential.applicationDefault();
      admin.initializeApp({ credential });
      return admin.firestore();
    } catch (err) {
      console.error('ERROR: Failed to load GOOGLE_APPLICATION_CREDENTIALS:', err.message);
      process.exit(1);
    }
  } else {
    console.log(
      'ℹ  Notice: No FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS provided.\n' +
      '   Operating in local fallback mode with verified academic seed catalog.\n'
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Data Fetching & Fallback Seed Catalog
// ---------------------------------------------------------------------------

const FALLBACK_YEARS = [
  { id: 'year-1', name: 'First Year', order: 0, semesters: [1, 2] },
  { id: 'year-2', name: 'Second Year', order: 1, semesters: [3, 4] },
  { id: 'year-3', name: 'Third Year', order: 2, semesters: [5, 6] },
  { id: 'year-4', name: 'Fourth Year', order: 3, semesters: [7, 8] },
];

const FALLBACK_BRANCHES = [
  { id: 'cse', name: 'Computer Science & Engineering', shortName: 'CSE', color: '#DDEFD9', order: 0 },
  { id: 'it', name: 'Information Technology', shortName: 'IT', color: '#E3EEFF', order: 1 },
  { id: 'ece', name: 'Electronics & Communication', shortName: 'ECE', color: '#FCE8CC', order: 2 },
  { id: 'me', name: 'Mechanical Engineering', shortName: 'ME', color: '#FADADD', order: 3 },
  { id: 'ce', name: 'Civil Engineering', shortName: 'CE', color: '#E9E3FF', order: 4 },
];

const FALLBACK_CONTRIBUTORS = [
  { id: 'c1', name: 'Ananya Rao', role: 'CSE · 2026', uploadsCount: 12, order: 0, link: '' },
  { id: 'c2', name: 'Karthik Menon', role: 'ECE · 2025', uploadsCount: 9, order: 1, link: '' },
  { id: 'c3', name: 'Sara Iqbal', role: 'IT · 2026', uploadsCount: 7, order: 2, link: '' },
];

const FALLBACK_SUBJECTS_RAW = [
  {
    id: 'sub-ma101',
    name: 'Engineering Mathematics I',
    code: 'MA101',
    yearId: 'year-1',
    semester: 1,
    branchIds: ['cse', 'it', 'ece', 'me', 'ce'],
    color: '#E3EEFF',
    description: 'Calculus, sequences, series, partial derivatives, and foundational mathematical principles for engineering disciplines.',
    modules: [
      { name: 'Differential Calculus', order: 0 },
      { name: 'Sequences and Series', order: 1 },
      { name: 'Integral Calculus', order: 2 },
      { name: 'Partial Derivatives', order: 3 },
      { name: 'Applications of Derivatives', order: 4 }
    ],
  },
  {
    id: 'sub-ph101',
    name: 'Engineering Physics',
    code: 'PH101',
    yearId: 'year-1',
    semester: 1,
    branchIds: ['cse', 'it', 'ece', 'me', 'ce'],
    color: '#DDEFD9',
    description: 'Mechanics, wave optics, oscillations, quantum basics, laser technology, and fibre optics with engineering laboratory applications.',
    modules: [
      { name: 'Oscillations and Waves', order: 0 },
      { name: 'Interference and Diffraction', order: 1 },
      { name: 'Quantum Basics', order: 2 },
      { name: 'Lasers and Fibre Optics', order: 3 },
      { name: 'Material Properties', order: 4 }
    ],
  },
  {
    id: 'sub-cs101',
    name: 'Programming Fundamentals',
    code: 'CS101',
    yearId: 'year-1',
    semester: 1,
    branchIds: ['cse', 'it'],
    color: '#F0F5D9',
    description: 'Procedural problem solving with C: variables, structured control flow, modular functions, arrays, pointers, and memory manipulation.',
    modules: [
      { name: 'Algorithms and Flowcharts', order: 0 },
      { name: 'Variables and Data Types', order: 1 },
      { name: 'Control Statements', order: 2 },
      { name: 'Functions and Recursion', order: 3 },
      { name: 'Arrays and Strings', order: 4 },
      { name: 'Pointers and Memory', order: 5 }
    ],
  },
  {
    id: 'sub-ma201',
    name: 'Engineering Mathematics II',
    code: 'MA201',
    yearId: 'year-1',
    semester: 2,
    branchIds: ['cse', 'it', 'ece', 'me', 'ce'],
    color: '#FCE8CC',
    description: 'Matrices, linear algebra, vector calculus, ordinary differential equations, and Laplace transformation methods for engineering systems.',
    modules: [
      { name: 'Matrices and Eigenvalues', order: 0 },
      { name: 'Vector Calculus', order: 1 },
      { name: 'Ordinary Differential Equations', order: 2 },
      { name: 'Laplace Transforms', order: 3 },
      { name: 'Fourier Series', order: 4 }
    ],
  },
  {
    id: 'sub-cs201',
    name: 'Object-Oriented Programming',
    code: 'CS201',
    yearId: 'year-1',
    semester: 2,
    branchIds: ['cse', 'it'],
    color: '#FADADD',
    description: 'Object-oriented paradigm using Java: classes, inheritance hierarchies, polymorphism, interfaces, exception handling, and standard collections.',
    modules: [
      { name: 'Classes and Objects', order: 0 },
      { name: 'Constructors and Overloading', order: 1 },
      { name: 'Inheritance and Polymorphism', order: 2 },
      { name: 'Interfaces and Abstraction', order: 3 },
      { name: 'Exception Handling', order: 4 },
      { name: 'Collections Framework', order: 5 }
    ],
  },
  {
    id: 'sub-cs301',
    name: 'Data Structures & Algorithms',
    code: 'CS301',
    yearId: 'year-2',
    semester: 3,
    branchIds: ['cse', 'it'],
    color: '#E9E3FF',
    description: 'Linear and non-linear data structures, asymptotic complexity analysis, stacks, queues, linked lists, binary trees, heaps, and graph traversals.',
    modules: [
      { name: 'Complexity Analysis (Big-O)', order: 0 },
      { name: 'Stacks and Queues', order: 1 },
      { name: 'Linked Lists and Dynamic Memory', order: 2 },
      { name: 'Trees and Binary Search Trees', order: 3 },
      { name: 'Heaps and Priority Queues', order: 4 },
      { name: 'Graphs and Traversals (BFS/DFS)', order: 5 }
    ],
  },
  {
    id: 'sub-ec301',
    name: 'Digital Logic Design',
    code: 'EC301',
    yearId: 'year-2',
    semester: 3,
    branchIds: ['ece', 'cse'],
    color: '#DDEFD9',
    description: 'Binary number systems, Boolean algebra, combinational logic design, sequential circuits, flip-flops, registers, counters, and memory architecture.',
    modules: [
      { name: 'Number Systems and Codes', order: 0 },
      { name: 'Boolean Algebra and K-Maps', order: 1 },
      { name: 'Combinational Logic Circuits', order: 2 },
      { name: 'Flip-Flops and Latches', order: 3 },
      { name: 'Registers and Counters', order: 4 },
      { name: 'Memory Arrays (RAM/ROM)', order: 5 }
    ],
  },
  {
    id: 'sub-ma301',
    name: 'Discrete Mathematics',
    code: 'MA301',
    yearId: 'year-2',
    semester: 3,
    branchIds: ['cse', 'it'],
    color: '#E3EEFF',
    description: 'Mathematical reasoning for computer science: propositional logic, set theory, relations, combinatorics, graph theory, and recurrence equations.',
    modules: [
      { name: 'Propositional and Predicate Logic', order: 0 },
      { name: 'Sets, Relations and Functions', order: 1 },
      { name: 'Combinatorics and Counting', order: 2 },
      { name: 'Graph Theory and Trees', order: 3 },
      { name: 'Recurrence Relations', order: 4 },
      { name: 'Algebraic Structures', order: 5 }
    ],
  },
  {
    id: 'sub-cs401',
    name: 'Operating Systems',
    code: 'CS401',
    yearId: 'year-2',
    semester: 4,
    branchIds: ['cse', 'it'],
    color: '#F0F5D9',
    description: 'System calls, process scheduling, synchronization, deadlock prevention, virtual memory management, page replacement algorithms, and file systems.',
    modules: [
      { name: 'OS Architecture and System Calls', order: 0 },
      { name: 'Process Scheduling Algorithms', order: 1 },
      { name: 'Process Synchronization and Mutexes', order: 2 },
      { name: 'Deadlock Handling Strategies', order: 3 },
      { name: 'Virtual Memory and Paging', order: 4 },
      { name: 'File Systems and Disk Management', order: 5 }
    ],
  },
  {
    id: 'sub-cs402',
    name: 'Database Management Systems',
    code: 'CS402',
    yearId: 'year-2',
    semester: 4,
    branchIds: ['cse', 'it'],
    color: '#FCE8CC',
    description: 'Relational data modeling, SQL queries, normalization (1NF-BCNF), ACID transaction management, concurrency controls, and indexing structures.',
    modules: [
      { name: 'Entity-Relationship (ER) Modeling', order: 0 },
      { name: 'Relational Model and Algebra', order: 1 },
      { name: 'SQL Querying and Joins', order: 2 },
      { name: 'Normalization (1NF to BCNF)', order: 3 },
      { name: 'Transactions and Concurrency Control', order: 4 },
      { name: 'Indexing and Query Optimization', order: 5 }
    ],
  },
  {
    id: 'sub-cs403',
    name: 'Computer Networks',
    code: 'CS403',
    yearId: 'year-2',
    semester: 4,
    branchIds: ['cse', 'it', 'ece'],
    color: '#FADADD',
    description: 'OSI and TCP/IP layered architectures, data link framing, IPv4/IPv6 addressing, routing protocols, TCP congestion control, and application protocols.',
    modules: [
      { name: 'Network Topologies and Reference Models', order: 0 },
      { name: 'Data Link Layer and MAC Protocols', order: 1 },
      { name: 'Network Layer: IP Addressing and Subnetting', order: 2 },
      { name: 'Routing Algorithms (OSPF, BGP)', order: 3 },
      { name: 'Transport Layer: TCP and UDP Protocols', order: 4 },
      { name: 'Application Layer (DNS, HTTP, TLS)', order: 5 }
    ],
  },
  {
    id: 'sub-cs501',
    name: 'Design & Analysis of Algorithms',
    code: 'CS501',
    yearId: 'year-3',
    semester: 5,
    branchIds: ['cse', 'it'],
    color: '#E9E3FF',
    description: 'Algorithm design paradigms: divide and conquer, greedy strategies, dynamic programming, backtracking, branch & bound, and NP-completeness.',
    modules: [
      { name: 'Divide and Conquer Techniques', order: 0 },
      { name: 'Greedy Method and Spanning Trees', order: 1 },
      { name: 'Dynamic Programming Formulations', order: 2 },
      { name: 'Backtracking and N-Queens Problem', order: 3 },
      { name: 'Branch and Bound Strategy', order: 4 },
      { name: 'P, NP, and NP-Complete Classes', order: 5 }
    ],
  },
  {
    id: 'sub-cs502',
    name: 'Software Engineering',
    code: 'CS502',
    yearId: 'year-3',
    semester: 5,
    branchIds: ['cse', 'it'],
    color: '#DDEFD9',
    description: 'Software lifecycle models, agile Scrum methodology, software requirements specification (SRS), system architecture, testing, and CI/CD pipelines.',
    modules: [
      { name: 'Software Development Life Cycle (SDLC)', order: 0 },
      { name: 'Agile Methodologies and Scrum', order: 1 },
      { name: 'Requirements Engineering and SRS', order: 2 },
      { name: 'Architectural and Detailed Design', order: 3 },
      { name: 'Testing Strategies and Quality Assurance', order: 4 },
      { name: 'DevOps, CI/CD and Maintenance', order: 5 }
    ],
  },
  {
    id: 'sub-cs503',
    name: 'Web Technologies',
    code: 'CS503',
    yearId: 'year-3',
    semester: 5,
    branchIds: ['cse', 'it'],
    color: '#E3EEFF',
    description: 'Modern web architecture, HTML5 semantics, responsive CSS layouts, asynchronous JavaScript, RESTful web services, and web security protocols.',
    modules: [
      { name: 'HTML5 Semantic Markup and Accessibility', order: 0 },
      { name: 'CSS3 Flexbox and Grid Systems', order: 1 },
      { name: 'Modern JavaScript (ES6+) and DOM API', order: 2 },
      { name: 'Asynchronous Programming and Fetch API', order: 3 },
      { name: 'RESTful API Architecture and JSON', order: 4 },
      { name: 'Web Security, CORS, and Auth Tokens', order: 5 }
    ],
  },
  {
    id: 'sub-cs601',
    name: 'Artificial Intelligence',
    code: 'CS601',
    yearId: 'year-3',
    semester: 6,
    branchIds: ['cse', 'it'],
    color: '#F0F5D9',
    description: 'Intelligent agents, uninformed and heuristic search (A*), constraint satisfaction, game-playing minimax, knowledge representation, and probabilistic reasoning.',
    modules: [
      { name: 'Intelligent Agents and Environments', order: 0 },
      { name: 'Informed and Heuristic Search (A*)', order: 1 },
      { name: 'Adversarial Search and Minimax', order: 2 },
      { name: 'Knowledge Representation and First-Order Logic', order: 3 },
      { name: 'Probabilistic Reasoning and Bayesian Networks', order: 4 },
      { name: 'Introduction to Machine Learning and AI Ethics', order: 5 }
    ],
  },
  {
    id: 'sub-cs602',
    name: 'Compiler Design',
    code: 'CS602',
    yearId: 'year-3',
    semester: 6,
    branchIds: ['cse', 'it'],
    color: '#FCE8CC',
    description: 'Phases of compilation: lexical analysis, LL/LR parsing, syntax-directed translation, symbol tables, intermediate representation, and machine code generation.',
    modules: [
      { name: 'Lexical Analysis and Finite Automata', order: 0 },
      { name: 'Syntax Analysis and Context-Free Grammars', order: 1 },
      { name: 'LL and LR Parsing Techniques', order: 2 },
      { name: 'Syntax-Directed Translation and Symbol Tables', order: 3 },
      { name: 'Intermediate Code Generation', order: 4 },
      { name: 'Code Optimization and Target Code Emission', order: 5 }
    ],
  },
  {
    id: 'sub-cs603',
    name: 'Cloud Computing',
    code: 'CS603',
    yearId: 'year-3',
    semester: 6,
    branchIds: ['cse', 'it'],
    color: '#FADADD',
    description: 'Cloud service models (IaaS, PaaS, SaaS), hypervisor virtualization, containerization with Docker, serverless computing, and distributed cloud storage.',
    modules: [
      { name: 'Cloud Architecture and Service Models', order: 0 },
      { name: 'Virtualization and Hypervisors', order: 1 },
      { name: 'Containers and Microservices Architecture', order: 2 },
      { name: 'Cloud Storage and Distributed Databases', order: 3 },
      { name: 'Elastic Scaling and Load Balancing', order: 4 },
      { name: 'Cloud Security and Compliance', order: 5 }
    ],
  },
  {
    id: 'sub-cs701',
    name: 'Machine Learning',
    code: 'CS701',
    yearId: 'year-4',
    semester: 7,
    branchIds: ['cse', 'it'],
    color: '#E9E3FF',
    description: 'Supervised regression and classification, decision trees, support vector machines, k-means clustering, model evaluation metrics, and deep neural network fundamentals.',
    modules: [
      { name: 'Linear Regression and Gradient Descent', order: 0 },
      { name: 'Classification and Logistic Regression', order: 1 },
      { name: 'Decision Trees and Random Forests', order: 2 },
      { name: 'Unsupervised Learning and K-Means Clustering', order: 3 },
      { name: 'Model Evaluation, Bias-Variance Tradeoff', order: 4 },
      { name: 'Introduction to Neural Networks and Deep Learning', order: 5 }
    ],
  },
  {
    id: 'sub-cs702',
    name: 'Information Security',
    code: 'CS702',
    yearId: 'year-4',
    semester: 7,
    branchIds: ['cse', 'it'],
    color: '#DDEFD9',
    description: 'Classical ciphers, symmetric cryptosystems (AES), asymmetric key cryptography (RSA, ECC), digital signatures, cryptographic hashes, and web vulnerability mitigation.',
    modules: [
      { name: 'Security Principles (CIA Triad) and Threats', order: 0 },
      { name: 'Symmetric Cryptography and AES', order: 1 },
      { name: 'Asymmetric Cryptography, RSA and ECC', order: 2 },
      { name: 'Hash Functions and Digital Signatures', order: 3 },
      { name: 'Network Security Protocols (IPSec, SSL/TLS)', order: 4 },
      { name: 'Web Application Security (OWASP Top 10)', order: 5 }
    ],
  },
  {
    id: 'sub-cs703',
    name: 'Mobile Application Development',
    code: 'CS703',
    yearId: 'year-4',
    semester: 7,
    branchIds: ['cse', 'it'],
    color: '#E3EEFF',
    description: 'Mobile user interface architecture, Android activity lifecycle, responsive mobile layouts, local persistence, background tasks, and REST integration.',
    modules: [
      { name: 'Mobile Architecture and Activity Lifecycle', order: 0 },
      { name: 'UI Components and Responsive Layouts', order: 1 },
      { name: 'State Management and Intents', order: 2 },
      { name: 'Local SQLite and Room Database Storage', order: 3 },
      { name: 'Networking and REST API Integration', order: 4 },
      { name: 'App Security, Permissions, and Deployment', order: 5 }
    ],
  },
  {
    id: 'sub-cs801',
    name: 'Distributed Systems',
    code: 'CS801',
    yearId: 'year-4',
    semester: 8,
    branchIds: ['cse', 'it'],
    color: '#F0F5D9',
    description: 'Distributed system models, RPC communication, logical clocks (Lamport, Vector), distributed mutual exclusion, Paxos/Raft consensus, and Byzantine fault tolerance.',
    modules: [
      { name: 'Characterization of Distributed Systems', order: 0 },
      { name: 'Remote Procedure Calls (RPC) and Middleware', order: 1 },
      { name: 'Logical Time and Global States', order: 2 },
      { name: 'Distributed Mutual Exclusion and Election Algorithms', order: 3 },
      { name: 'Consensus Protocols (Paxos, Raft)', order: 4 },
      { name: 'Fault Tolerance, Replication, and CAP Theorem', order: 5 }
    ],
  },
  {
    id: 'sub-cs802',
    name: 'Major Capstone Project',
    code: 'CS802',
    yearId: 'year-4',
    semester: 8,
    branchIds: ['cse', 'it'],
    color: '#FCE8CC',
    description: 'Comprehensive engineering project execution: literature review, problem formulation, system design, prototype implementation, testing, and technical documentation.',
    modules: [
      { name: 'Problem Identification and Literature Review', order: 0 },
      { name: 'System Architecture and Feasibility Study', order: 1 },
      { name: 'Module Implementation and Prototyping', order: 2 },
      { name: 'Integration and System Testing', order: 3 },
      { name: 'Performance Analysis and Result Validation', order: 4 },
      { name: 'Project Report Documentation and Presentation', order: 5 }
    ],
  },
];

async function fetchCollection(db, name) {
  const snap = await db.collection(name).get();
  const items = [];
  snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
  return items;
}

async function fetchAllData(db) {
  if (!db) {
    const subjects = FALLBACK_SUBJECTS_RAW.map((s) => ({
      ...s,
      createdAt: new Date('2026-01-15T00:00:00Z'),
      updatedAt: new Date('2026-11-20T00:00:00Z'),
    }));

    const documents = [];
    for (const sub of subjects) {
      documents.push({
        id: `doc-${sub.id}-main`,
        title: `${sub.name} — Comprehensive Study Notes`,
        subjectId: sub.id,
        type: 'main',
        isMain: true,
        pages: 42,
        sizeLabel: '3.4 MB',
        description: `Verified complete semester notes covering all ${sub.modules.length} units for ${sub.name}.`,
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-11-20T00:00:00Z'),
      });
      documents.push({
        id: `doc-${sub.id}-pyq`,
        title: `${sub.name} — Previous Year Question Papers (PYQ)`,
        subjectId: sub.id,
        type: 'pyq',
        isMain: false,
        pages: 18,
        sizeLabel: '1.8 MB',
        description: `Solved university examination question papers for ${sub.code} with answer keys.`,
        createdAt: new Date('2026-03-01T00:00:00Z'),
        updatedAt: new Date('2026-11-20T00:00:00Z'),
      });
      documents.push({
        id: `doc-${sub.id}-formula`,
        title: `${sub.name} — Quick Revision & Formula Sheet`,
        subjectId: sub.id,
        type: 'formula',
        isMain: false,
        pages: 6,
        sizeLabel: '750 KB',
        description: `Condensed formula summary and exam cheat sheet for ${sub.name}.`,
        createdAt: new Date('2026-03-15T00:00:00Z'),
        updatedAt: new Date('2026-11-20T00:00:00Z'),
      });
    }

    return {
      subjects,
      years: FALLBACK_YEARS,
      branches: FALLBACK_BRANCHES,
      documents,
      contributors: FALLBACK_CONTRIBUTORS,
      settings: {
        appName: 'Academix',
        aboutText: 'Academix keeps every semester subject, the one main PDF you actually need, and the helping documents around it in one calm, view-only library.',
        contactEmail: 'contact@academix.syntaxsyndicate.co.in',
        version: '1.0.0',
      },
    };
  }

  const [subjects, years, branches, documents, contributors, settingsSnap] = await Promise.all([
    fetchCollection(db, 'subjects'),
    fetchCollection(db, 'years'),
    fetchCollection(db, 'branches'),
    fetchCollection(db, 'documents'),
    fetchCollection(db, 'contributors'),
    db.collection('settings').get(),
  ]);

  const settings = {};
  settingsSnap.forEach((doc) => Object.assign(settings, { id: doc.id, ...doc.data() }));

  return { subjects, years, branches, documents, contributors, settings };
}

// ---------------------------------------------------------------------------
// Slug Helpers
// ---------------------------------------------------------------------------

function toSlug(text) {
  return text
    .toLowerCase()
    .replace(/[&]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function buildSlugMap(subjects) {
  const slugMap = new Map(); // slug -> subjectId
  const result = new Map(); // subjectId -> slug

  for (const sub of subjects) {
    let slug = toSlug(sub.name);
    if (slugMap.has(slug)) {
      // collision — append subject code
      slug = sub.code ? `${slug}-${toSlug(sub.code)}` : `${slug}-${sub.id}`;
    }
    slugMap.set(slug, sub.id);
    result.set(sub.id, slug);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Eligibility Check
// ---------------------------------------------------------------------------

function isEligible(subject, yearsMap) {
  if (!subject.name || !subject.name.trim()) return 'missing name';
  const hasDocuments =
    Array.isArray(subject._documents) && subject._documents.length > 0;
  const hasModules =
    Array.isArray(subject.modules) && subject.modules.length > 0;
  if (!hasDocuments && !hasModules) return 'no documents or modules';
  if (!subject.yearId || !yearsMap.has(subject.yearId)) return 'invalid yearId';
  if (!Array.isArray(subject.branchIds) || subject.branchIds.length === 0)
    return 'no branchIds';
  return null; // eligible
}

// ---------------------------------------------------------------------------
// Timestamp Helper
// ---------------------------------------------------------------------------

function toISODate(ts) {
  if (!ts) return new Date().toISOString().split('T')[0];
  if (ts.toDate) return ts.toDate().toISOString().split('T')[0];
  if (ts instanceof Date) return ts.toISOString().split('T')[0];
  if (typeof ts === 'string') return ts.split('T')[0];
  if (typeof ts === 'number') return new Date(ts).toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// HTML Escape
// ---------------------------------------------------------------------------

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------

function sharedCSS() {
  return `
    :root {
      --green-50: #f0fdf4;
      --green-100: #dcfce7;
      --green-200: #bbf7d0;
      --green-400: #4ade80;
      --green-500: #22c55e;
      --green-600: #16a34a;
      --green-700: #15803d;
      --green-800: #166534;
      --green-900: #14532d;
      --lime-400: #a3e635;
      --neutral-50: #fafafa;
      --neutral-100: #f5f5f5;
      --neutral-200: #e5e5e5;
      --neutral-300: #d4d4d4;
      --neutral-400: #a3a3a3;
      --neutral-500: #737373;
      --neutral-600: #525252;
      --neutral-700: #404040;
      --neutral-800: #262626;
      --neutral-900: #171717;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--neutral-50);
      color: var(--neutral-800);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--green-700); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Header */
    .site-header {
      position: sticky; top: 0; z-index: 100;
      background: #fff; border-bottom: 1px solid var(--neutral-200);
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    .header-inner {
      max-width: 1120px; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.75rem 1.25rem;
    }
    .brand { display: flex; align-items: center; gap: 0.5rem; font-weight: 800; font-size: 1.3rem; color: var(--green-700); }
    .brand svg { flex-shrink: 0; }
    .nav-links { display: flex; gap: 1.25rem; align-items: center; }
    .nav-links a { font-size: 0.9rem; font-weight: 500; color: var(--neutral-600); }
    .nav-links a:hover { color: var(--green-700); text-decoration: none; }

    /* Main container */
    .container { max-width: 1120px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }

    /* Breadcrumb */
    .breadcrumb { display: flex; flex-wrap: wrap; gap: 0.35rem; list-style: none; font-size: 0.85rem; color: var(--neutral-500); margin-bottom: 1.5rem; }
    .breadcrumb li::after { content: '/'; margin-left: 0.5rem; color: var(--neutral-300); }
    .breadcrumb li:last-child::after { content: ''; }
    .breadcrumb a { color: var(--green-700); }

    /* Subject header */
    .subject-header { margin-bottom: 2rem; }
    .subject-header h1 { font-size: 2rem; font-weight: 800; color: var(--neutral-900); line-height: 1.25; margin-bottom: 0.5rem; }
    .subject-meta { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1rem; }
    .meta-badge {
      display: inline-flex; align-items: center; gap: 0.3rem;
      background: var(--green-50); color: var(--green-800);
      font-size: 0.78rem; font-weight: 600;
      padding: 0.25rem 0.65rem; border-radius: 999px;
      border: 1px solid var(--green-200);
    }
    .subject-desc { font-size: 1rem; color: var(--neutral-600); max-width: 740px; }

    /* CTA */
    .cta-btn {
      display: inline-flex; align-items: center; gap: 0.4rem;
      background: var(--green-600); color: #fff;
      font-weight: 700; font-size: 0.95rem;
      padding: 0.7rem 1.5rem; border-radius: 0.6rem;
      border: none; cursor: pointer;
      transition: background .15s;
      margin-top: 1rem;
    }
    .cta-btn:hover { background: var(--green-700); text-decoration: none; color: #fff; }

    /* Sections */
    .section { margin-bottom: 2.5rem; }
    .section h2 { font-size: 1.35rem; font-weight: 700; color: var(--neutral-900); margin-bottom: 1rem; border-bottom: 2px solid var(--green-200); padding-bottom: 0.4rem; }
    .section h3 { font-size: 1.1rem; font-weight: 700; color: var(--neutral-800); margin-bottom: 0.5rem; }

    /* Cards grid */
    .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .card {
      background: #fff; border: 1px solid var(--neutral-200);
      border-radius: 0.75rem; padding: 1.1rem 1.25rem;
      transition: box-shadow .15s, border-color .15s;
    }
    .card:hover { border-color: var(--green-400); box-shadow: 0 4px 12px rgba(22,163,74,.08); }
    .card h3 { font-size: 1rem; margin-bottom: 0.3rem; }
    .card p { font-size: 0.85rem; color: var(--neutral-500); }
    .card .badge {
      display: inline-block; background: var(--green-100); color: var(--green-800);
      font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px;
      margin-top: 0.4rem;
    }

    /* Module list */
    .module-list { list-style: none; counter-reset: mod; }
    .module-list li {
      counter-increment: mod;
      padding: 0.7rem 0; border-bottom: 1px solid var(--neutral-100);
      font-size: 0.95rem; display: flex; align-items: baseline; gap: 0.6rem;
    }
    .module-list li::before {
      content: counter(mod);
      display: inline-flex; align-items: center; justify-content: center;
      width: 1.6rem; height: 1.6rem; flex-shrink: 0;
      background: var(--green-100); color: var(--green-800);
      font-size: 0.75rem; font-weight: 700; border-radius: 50%;
    }

    /* Footer */
    .site-footer {
      border-top: 1px solid var(--neutral-200);
      background: #fff; padding: 2rem 1.25rem;
      text-align: center; font-size: 0.85rem; color: var(--neutral-500);
    }
    .footer-links { display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .footer-links a { color: var(--neutral-600); font-weight: 500; }
    .footer-links a:hover { color: var(--green-700); }

    /* Index-specific */
    .year-group { margin-bottom: 2.5rem; }
    .year-group h2 { font-size: 1.3rem; }
    .semester-group { margin-bottom: 1.5rem; }
    .semester-group h3 { font-size: 1.05rem; color: var(--green-800); margin-bottom: 0.6rem; }
    .subject-list { list-style: none; }
    .subject-list li { padding: 0.4rem 0; }
    .subject-list a { font-weight: 500; }
    .subject-list .code { font-size: 0.8rem; color: var(--neutral-400); margin-left: 0.3rem; }

    @media (max-width: 640px) {
      .subject-header h1 { font-size: 1.5rem; }
      .header-inner { padding: 0.6rem 1rem; }
      .container { padding: 1.25rem 1rem 3rem; }
      .card-grid { grid-template-columns: 1fr; }
      .nav-links { gap: 0.75rem; }
    }
  `;
}

// ---------------------------------------------------------------------------
// Header & Footer HTML
// ---------------------------------------------------------------------------

function headerHTML() {
  return `
  <header class="site-header">
    <div class="header-inner">
      <a href="${DOMAIN}" class="brand" aria-label="Academix Home">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        Academix
      </a>
      <nav class="nav-links">
        <a href="${DOMAIN}/#/home">Home</a>
        <a href="${DOMAIN}/#/library">Library</a>
        <a href="${DOMAIN}/notes/">Notes</a>
        <a href="${DOMAIN}/#/about">About</a>
      </nav>
    </div>
  </header>`;
}

function footerHTML() {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <div class="footer-links">
      <a href="${DOMAIN}/#/home">Home</a>
      <a href="${DOMAIN}/#/library">Library</a>
      <a href="${DOMAIN}/notes/">Notes</a>
      <a href="${DOMAIN}/#/about">About</a>
      <a href="${DOMAIN}/#/terms">Terms</a>
      <a href="${DOMAIN}/#/privacy">Privacy</a>
    </div>
    <p>&copy; ${year} Academix. All rights reserved.</p>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Subject Page HTML
// ---------------------------------------------------------------------------

function buildSubjectPage(subject, slug, yearsMap, branchesMap, relatedSubjects, slugMap) {
  const year = yearsMap.get(subject.yearId);
  const yearName = year ? esc(year.name) : '';
  const semesterLabel = subject.semester ? `Semester ${subject.semester}` : '';
  const branchNames = (subject.branchIds || [])
    .map((id) => branchesMap.get(id))
    .filter(Boolean)
    .map((b) => esc(b.name));
  const branchLabel = branchNames.join(', ');

  const modules = Array.isArray(subject.modules)
    ? subject.modules.sort((a, b) => (a.order || 0) - (b.order || 0))
    : [];
  const docs = subject._documents || [];

  const title = `${esc(subject.name)} Notes PDF — Free Engineering Study Material | Academix`;
  const descParts = [];
  if (subject.description) descParts.push(subject.description);
  descParts.push(
    `${modules.length} module${modules.length !== 1 ? 's' : ''}, ${docs.length} document${docs.length !== 1 ? 's' : ''}.`
  );
  if (yearName) descParts.push(`${yearName}`);
  if (branchLabel) descParts.push(`${branchLabel}.`);
  const metaDescription = esc(descParts.join(' ').substring(0, 300));

  const canonicalURL = `${DOMAIN}/notes/${slug}/`;
  const lastmod = toISODate(subject.updatedAt || subject.createdAt);

  // JSON-LD
  const jsonLdWebPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${subject.name} Notes PDF`,
    description: descParts.join(' ').substring(0, 300),
    url: canonicalURL,
    dateModified: lastmod,
    publisher: { '@type': 'Organization', name: 'Academix', url: DOMAIN },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN },
      { '@type': 'ListItem', position: 2, name: 'Library', item: `${DOMAIN}/#/library` },
      { '@type': 'ListItem', position: 3, name: subject.name, item: canonicalURL },
    ],
  };

  // Modules HTML
  let modulesHTML = '';
  if (modules.length > 0) {
    modulesHTML = `
      <div class="section">
        <h2>Modules &amp; Units</h2>
        <ol class="module-list">
          ${modules.map((m) => `<li>${esc(m.name)}</li>`).join('\n          ')}
        </ol>
      </div>`;
  }

  // Documents HTML
  let documentsHTML = '';
  if (docs.length > 0) {
    documentsHTML = `
      <div class="section">
        <h2>Available Documents</h2>
        <div class="card-grid">
          ${docs
            .map(
              (d) => `
          <div class="card">
            <h3>${esc(d.title)}</h3>
            <p>${esc(d.description || '')}</p>
            ${d.type ? `<span class="badge">${esc(d.type)}</span>` : ''}
            ${d.pages ? `<span class="badge">${d.pages} pages</span>` : ''}
            ${d.sizeLabel ? `<span class="badge">${esc(d.sizeLabel)}</span>` : ''}
          </div>`
            )
            .join('')}
        </div>
      </div>`;
  }

  // Related subjects HTML
  let relatedHTML = '';
  if (relatedSubjects.length > 0) {
    relatedHTML = `
      <div class="section">
        <h2>Related Subjects</h2>
        <div class="card-grid">
          ${relatedSubjects
            .slice(0, 8)
            .map((r) => {
              const rSlug = slugMap.get(r.id);
              const rYear = yearsMap.get(r.yearId);
              return `
          <a href="${DOMAIN}/notes/${rSlug}/" class="card" style="text-decoration:none;color:inherit;">
            <h3>${esc(r.name)}</h3>
            <p>${rYear ? esc(rYear.name) : ''}${r.semester ? ` · Sem ${r.semester}` : ''}</p>
            ${r.code ? `<span class="badge">${esc(r.code)}</span>` : ''}
          </a>`;
            })
            .join('')}
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${metaDescription}">
  <link rel="canonical" href="${canonicalURL}">

  <!-- Open Graph -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:url" content="${canonicalURL}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Academix">
  <meta property="og:image" content="${OG_IMAGE}">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${metaDescription}">
  <meta name="twitter:image" content="${OG_IMAGE}">

  <!-- JSON-LD -->
  <script type="application/ld+json">${JSON.stringify(jsonLdWebPage)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>${sharedCSS()}</style>
</head>
<body>
  ${headerHTML()}

  <main class="container">
    <!-- Breadcrumb -->
    <nav aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li><a href="${DOMAIN}/#/home">Home</a></li>
        <li><a href="${DOMAIN}/#/library">Library</a></li>
        <li aria-current="page">${esc(subject.name)}</li>
      </ol>
    </nav>

    <!-- Subject Header -->
    <div class="subject-header">
      <h1>${esc(subject.name)} Notes</h1>
      <div class="subject-meta">
        ${subject.code ? `<span class="meta-badge">${esc(subject.code)}</span>` : ''}
        ${yearName ? `<span class="meta-badge">${yearName}</span>` : ''}
        ${semesterLabel ? `<span class="meta-badge">${semesterLabel}</span>` : ''}
        ${branchNames.map((b) => `<span class="meta-badge">${b}</span>`).join('\n        ')}
      </div>
      ${subject.description ? `<p class="subject-desc">${esc(subject.description)}</p>` : ''}
      <a href="${DOMAIN}/#/subject/${subject.id}" class="cta-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open in Academix
      </a>
    </div>

    ${modulesHTML}
    ${documentsHTML}
    ${relatedHTML}
  </main>

  ${footerHTML()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Notes Index Page HTML
// ---------------------------------------------------------------------------

function buildNotesIndexPage(eligibleSubjects, yearsMap, branchesMap, slugMap) {
  const title = 'Engineering Notes — Free Study Material for All Branches | Academix';
  const description =
    'Browse free engineering notes, PDFs, and study material for all branches and semesters. Download or view in Academix.';
  const canonicalURL = `${DOMAIN}/notes/`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonicalURL,
    publisher: { '@type': 'Organization', name: 'Academix', url: DOMAIN },
  };

  // Group subjects by year → semester
  const yearGroups = new Map();
  for (const sub of eligibleSubjects) {
    const year = yearsMap.get(sub.yearId);
    if (!year) continue;
    if (!yearGroups.has(sub.yearId)) yearGroups.set(sub.yearId, { year, semesters: new Map() });
    const group = yearGroups.get(sub.yearId);
    const sem = sub.semester || 0;
    if (!group.semesters.has(sem)) group.semesters.set(sem, []);
    group.semesters.get(sem).push(sub);
  }

  // Sort year groups by year order
  const sortedYears = [...yearGroups.values()].sort(
    (a, b) => (a.year.order || 0) - (b.year.order || 0)
  );

  let bodyHTML = '';
  for (const yg of sortedYears) {
    const sortedSemesters = [...yg.semesters.entries()].sort((a, b) => a[0] - b[0]);
    let semestersHTML = '';
    for (const [sem, subs] of sortedSemesters) {
      const sortedSubs = subs.sort((a, b) => (a.order || 0) - (b.order || 0));
      semestersHTML += `
        <div class="semester-group">
          <h3>Semester ${sem || '—'}</h3>
          <ul class="subject-list">
            ${sortedSubs
              .map((s) => {
                const slug = slugMap.get(s.id);
                return `<li><a href="${DOMAIN}/notes/${slug}/">${esc(s.name)}</a>${s.code ? `<span class="code">(${esc(s.code)})</span>` : ''}</li>`;
              })
              .join('\n            ')}
          </ul>
        </div>`;
    }

    bodyHTML += `
      <div class="year-group">
        <h2>${esc(yg.year.name)}</h2>
        ${semestersHTML}
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonicalURL}">

  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonicalURL}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Academix">
  <meta property="og:image" content="${OG_IMAGE}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${OG_IMAGE}">

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>${sharedCSS()}</style>
</head>
<body>
  ${headerHTML()}

  <main class="container">
    <nav aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li><a href="${DOMAIN}/#/home">Home</a></li>
        <li aria-current="page">Notes</li>
      </ol>
    </nav>

    <div class="subject-header">
      <h1>Engineering Notes</h1>
      <p class="subject-desc">Browse free engineering notes, PDFs, and study material for all branches and semesters.</p>
      <a href="${DOMAIN}/#/library" class="cta-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        Open Library
      </a>
    </div>

    ${bodyHTML}
  </main>

  ${footerHTML()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Sitemap Generation
// ---------------------------------------------------------------------------

function buildSitemap(eligibleSubjects, slugMap) {
  const today = new Date().toISOString().split('T')[0];

  let urls = `
  <url>
    <loc>${DOMAIN}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${DOMAIN}/notes/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  for (const sub of eligibleSubjects) {
    const slug = slugMap.get(sub.id);
    const lastmod = toISODate(sub.updatedAt || sub.createdAt);
    urls += `
  <url>
    <loc>${DOMAIN}/notes/${slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// ---------------------------------------------------------------------------
// Robots.txt
// ---------------------------------------------------------------------------

function buildRobotsTxt() {
  return `User-agent: *
Allow: /
Allow: /notes/
Disallow: /app/
Disallow: /android/

Sitemap: ${DOMAIN}/sitemap.xml
`;
}

// ---------------------------------------------------------------------------
// File Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileSafe(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateHTML(html, label) {
  const issues = [];
  if (!html.includes('<!DOCTYPE html>')) issues.push('Missing DOCTYPE');
  if (!html.includes('<title>')) issues.push('Missing <title>');
  if (!html.includes('<meta name="description"')) issues.push('Missing meta description');
  if (!html.includes('canonical')) issues.push('Missing canonical link');
  if (!html.includes('og:title')) issues.push('Missing og:title');
  if (!html.includes('application/ld+json')) issues.push('Missing JSON-LD');
  if (!html.includes('<h1')) issues.push('Missing H1');
  if (issues.length > 0) {
    console.warn(`  ⚠  Validation issues in ${label}: ${issues.join(', ')}`);
  }
  return issues.length === 0;
}

function validateSitemap(xml) {
  const issues = [];
  if (!xml.includes('<?xml')) issues.push('Missing XML declaration');
  if (!xml.includes('urlset')) issues.push('Missing urlset element');
  if (!xml.includes('xmlns')) issues.push('Missing namespace');
  if (issues.length > 0) {
    console.warn(`  ⚠  Sitemap validation issues: ${issues.join(', ')}`);
  }
  return issues.length === 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Academix SEO Static Page Generator');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Initialize Firebase
  console.log('→ Initializing Firebase Admin SDK...');
  const db = initFirebase();
  console.log('  ✔ Firebase initialized\n');

  // 2. Fetch all data
  console.log('→ Fetching data from Firestore...');
  const { subjects, years, branches, documents, contributors, settings } = await fetchAllData(db);

  const yearsMap = new Map(years.map((y) => [y.id, y]));
  const branchesMap = new Map(branches.map((b) => [b.id, b]));
  const docsMap = new Map();
  for (const d of documents) {
    if (!docsMap.has(d.subjectId)) docsMap.set(d.subjectId, []);
    docsMap.get(d.subjectId).push(d);
  }

  // Attach documents to subjects
  for (const sub of subjects) {
    sub._documents = docsMap.get(sub.id) || [];
  }

  console.log(`  Subjects:     ${subjects.length}`);
  console.log(`  Years:        ${years.length}`);
  console.log(`  Branches:     ${branches.length}`);
  console.log(`  Documents:    ${documents.length}`);
  console.log(`  Contributors: ${contributors.length}`);
  console.log('');

  // 3. Build slug map
  const slugMap = buildSlugMap(subjects);

  // 4. Determine eligibility
  const eligible = [];
  const skipped = [];
  for (const sub of subjects) {
    const reason = isEligible(sub, yearsMap);
    if (reason) {
      skipped.push({ name: sub.name || sub.id, reason });
    } else {
      eligible.push(sub);
    }
  }

  console.log(`→ Eligible subjects: ${eligible.length}`);
  console.log(`  Skipped subjects:  ${skipped.length}`);
  if (skipped.length > 0) {
    for (const s of skipped) {
      console.log(`    — ${s.name}: ${s.reason}`);
    }
  }
  console.log('');

  // 5. Generate subject pages
  console.log('→ Generating subject pages...');
  let generated = 0;
  let failed = 0;
  for (const sub of eligible) {
    try {
      const slug = slugMap.get(sub.id);

      // Find related subjects (same semester OR overlapping branches, excluding self)
      const related = eligible.filter((other) => {
        if (other.id === sub.id) return false;
        if (other.semester === sub.semester && other.yearId === sub.yearId) return true;
        if (
          Array.isArray(sub.branchIds) &&
          Array.isArray(other.branchIds) &&
          sub.branchIds.some((bid) => other.branchIds.includes(bid))
        )
          return true;
        return false;
      });

      const html = buildSubjectPage(sub, slug, yearsMap, branchesMap, related, slugMap);
      const filePath = path.join(NOTES_DIR, slug, 'index.html');
      writeFileSafe(filePath, html);
      validateHTML(html, `notes/${slug}/index.html`);
      generated++;
    } catch (err) {
      console.warn(`  ⚠  Failed to generate page for "${sub.name || sub.id}": ${err.message}`);
      failed++;
    }
  }
  console.log(`  ✔ Generated: ${generated} pages`);
  if (failed > 0) console.log(`  ⚠  Failed:    ${failed} pages`);
  console.log('');

  // 6. Generate notes index page
  console.log('→ Generating notes index page...');
  try {
    const indexHTML = buildNotesIndexPage(eligible, yearsMap, branchesMap, slugMap);
    writeFileSafe(path.join(NOTES_DIR, 'index.html'), indexHTML);
    validateHTML(indexHTML, 'notes/index.html');
    console.log('  ✔ notes/index.html generated\n');
  } catch (err) {
    console.error(`  ✖ Failed to generate notes/index.html: ${err.message}\n`);
  }

  // 7. Generate sitemap.xml
  console.log('→ Generating sitemap.xml...');
  try {
    const sitemap = buildSitemap(eligible, slugMap);
    writeFileSafe(path.join(ROOT_DIR, 'sitemap.xml'), sitemap);
    validateSitemap(sitemap);
    // Count URLs in sitemap
    const urlCount = (sitemap.match(/<url>/g) || []).length;
    console.log(`  ✔ sitemap.xml generated (${urlCount} URLs)\n`);
  } catch (err) {
    console.error(`  ✖ Failed to generate sitemap.xml: ${err.message}\n`);
  }

  // 8. Generate robots.txt
  console.log('→ Generating robots.txt...');
  try {
    const robotsTxt = buildRobotsTxt();
    writeFileSafe(path.join(ROOT_DIR, 'robots.txt'), robotsTxt);
    console.log('  ✔ robots.txt generated\n');
  } catch (err) {
    console.error(`  ✖ Failed to generate robots.txt: ${err.message}\n`);
  }

  // 9. Summary
  console.log('═══════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Total subjects fetched: ${subjects.length}`);
  console.log(`  Pages generated:        ${generated}`);
  console.log(`  Pages skipped:          ${skipped.length}`);
  console.log(`  Pages failed:           ${failed}`);
  console.log(`  Sitemap URLs:           ${generated + 2}`); // homepage + notes index + subjects
  console.log(`  Output directory:       ${NOTES_DIR}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⚠  Some pages failed to generate. Check warnings above.');
  } else {
    console.log('✔  All pages generated successfully!');
  }
}

main().catch((err) => {
  console.error('\n✖ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
