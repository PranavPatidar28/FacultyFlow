export type Role = "admin" | "coordinator" | "faculty";
export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string;
  facultyId?: string;
  authId?: string;
};
export type Department = {
  id: string;
  name: string;
  code: string;
  color: string;
};
export type Faculty = {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  title: string;
  subjects: string[];
  target: number;
  maxWeekly: number;
  maxDaily: number;
  maxConsecutive: number;
  unavailable: string[];
  preferred: string[];
};
export type Subject = {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  color: string;
};
export type Section = {
  id: string;
  name: string;
  departmentId: string;
  size: number;
};
export type Room = {
  id: string;
  name: string;
  type: "lecture" | "lab";
  capacity: number;
};
export type Requirement = {
  id: string;
  subjectId: string;
  sectionId: string;
  kind: "lecture" | "lab";
  sessions: number;
  duration: number;
  facultyId?: string;
};
export type Period = {
  id: number;
  label: string;
  start: string;
  end: string;
  break: boolean;
};
export type Settings = {
  name: string;
  term: string;
  timezone: string;
  start: string;
  end: string;
  days: number[];
  holidays: string[];
  periods: Period[];
};
export type Entry = {
  id: string;
  requirementId: string;
  facultyId: string;
  roomId: string;
  day: number;
  period: number;
  duration: number;
  locked: boolean;
};
export type SolverStatus =
  "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "MODEL_INVALID";
export type Version = {
  id: string;
  name: string;
  status: "draft" | "published" | "archived";
  entries: Entry[];
  createdAt: string;
  effectiveDate?: string;
  solverStatus?: SolverStatus;
  quality?: Record<string, number>;
  diagnostics: string[];
  sourceRevision: number;
};
export type Occurrence = {
  id: string;
  versionId: string;
  entryId: string;
  requirementId: string;
  date: string;
  period: number;
  duration: number;
  facultyId: string;
  originalFacultyId: string;
  roomId: string;
  sectionId: string;
};
export type Absence = {
  id: string;
  facultyId: string;
  date: string;
  periods: number[];
  reason: string;
  status: "pending" | "approved" | "rejected";
};
export type Coverage = {
  id: string;
  occurrenceId: string;
  absenceId: string;
  status: "uncovered" | "offered" | "covered";
  substituteId?: string;
};
export type Offer = {
  id: string;
  coverageId: string;
  facultyId: string;
  status:
    | "pending"
    | "accepted"
    | "declined"
    | "expired"
    | "withdrawn"
    | "invalidated";
  expiresAt: string;
  createdAt: string;
  versionId: string;
};
export type Notification = {
  id: string;
  memberId: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};
export type Audit = {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  createdAt: string;
};
export type SolverInput = Pick<
  State,
  "settings" | "faculty" | "rooms" | "sections" | "requirements"
> & { locks: Entry[] };
export type Job = {
  id: string;
  key: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  input: SolverInput;
  revision: number;
  versionId?: string;
  error?: string;
};
export type RoomClosure = {
  id: string;
  roomId: string;
  date: string;
  periods: number[];
  reason: string;
  status: "reported" | "confirmed" | "cancelled";
  reportedBy: string;
  confirmedBy?: string;
  createdAt: string;
};
export type RepairRequest = {
  id: string;
  trigger: "closure" | "absence";
  triggerId: string;
  date: string;
  departmentIds: string[];
  occurrenceIds: string[];
  actorId: string;
  status: "open" | "resolved" | "cancelled";
  activePlanId?: string;
  createdAt: string;
};
export type RepairInput = Pick<
  State,
  "settings" | "faculty" | "rooms" | "sections" | "requirements"
> & {
  mode: "repair";
  date: string;
  occurrences: Occurrence[];
  absences: Absence[];
  closures: RoomClosure[];
  coverage: Coverage[];
  offers: Offer[];
  departmentIds: string[];
  targetIds: string[];
  movableIds: string[];
  activeOccurrenceIds: string[];
  weeklyLoads: Record<string, number>;
  futurePeriods: number[];
};
export type RepairChange = {
  occurrenceId: string;
  before: Occurrence;
  after: Occurrence;
  reason: string;
};
export type RepairPlan = {
  id: string;
  key: string;
  requestId: string;
  createdAt: string;
  input: RepairInput;
  status:
    | "queued"
    | "running"
    | "awaiting-consent"
    | "ready"
    | "applied"
    | "declined"
    | "expired"
    | "withdrawn"
    | "stale"
    | "unsolved"
    | "failed";
  changes: RepairChange[];
  unresolvedOccurrenceIds: string[];
  impact: {
    timeChanges: number;
    classesChanged: number;
    facultyAffected: number;
    roomChanges: number;
    gapDelta: number;
  };
  solverStatus?: SolverStatus;
  diagnostics: string[];
  deadline?: string;
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
};
export type RepairConsent = {
  id: string;
  planId: string;
  facultyId: string;
  status: "pending" | "accepted" | "declined";
  decidedAt?: string;
};
export type State = {
  revision: number;
  settings: Settings;
  members: Member[];
  departments: Department[];
  faculty: Faculty[];
  subjects: Subject[];
  sections: Section[];
  rooms: Room[];
  requirements: Requirement[];
  versions: Version[];
  occurrences: Occurrence[];
  absences: Absence[];
  coverage: Coverage[];
  offers: Offer[];
  notifications: Notification[];
  jobs: Job[];
  audit: Audit[];
  roomClosures: RoomClosure[];
  repairRequests: RepairRequest[];
  repairPlans: RepairPlan[];
  repairConsents: RepairConsent[];
};
export type Candidate = {
  facultyId: string;
  score: number;
  weeklyLoad: number;
  resultingLoad: number;
  recentCover: number;
  reasons: string[];
};
export type Viewer = { member: Member; demo: boolean };
export type AppData = Omit<State, "jobs" | "repairPlans"> & {
  features: { dailyChanges: boolean };
  repairPlans: Omit<RepairPlan, "input">[];
  jobs: Omit<Job, "input">[];
  viewer: Viewer;
  candidates: Record<string, Candidate[]>;
};
