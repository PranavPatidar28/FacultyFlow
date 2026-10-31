import type { State, Entry } from "./types";
import { addDays, localDate, weekday } from "./time";
export function emptyState(): State {
  const today = localDate();
  return {
    revision: 0,
    settings: {
      name: "FacultyFlow College",
      term: "Academic term",
      timezone: "Asia/Kolkata",
      start: today,
      end: addDays(today, 100),
      days: [1, 2, 3, 4, 5],
      holidays: [],
      periods: [
        {
          id: 0,
          label: "Period 1",
          start: "09:00",
          end: "09:50",
          break: false,
        },
        {
          id: 1,
          label: "Period 2",
          start: "09:50",
          end: "10:40",
          break: false,
        },
        {
          id: 2,
          label: "Short break",
          start: "10:40",
          end: "11:00",
          break: true,
        },
        {
          id: 3,
          label: "Period 3",
          start: "11:00",
          end: "11:50",
          break: false,
        },
        {
          id: 4,
          label: "Period 4",
          start: "11:50",
          end: "12:40",
          break: false,
        },
        { id: 5, label: "Lunch", start: "12:40", end: "13:30", break: true },
        {
          id: 6,
          label: "Period 5",
          start: "13:30",
          end: "14:20",
          break: false,
        },
        {
          id: 7,
          label: "Period 6",
          start: "14:20",
          end: "15:10",
          break: false,
        },
      ],
    },
    members: [],
    departments: [],
    faculty: [],
    subjects: [],
    sections: [],
    rooms: [],
    requirements: [],
    versions: [],
    occurrences: [],
    absences: [],
    coverage: [],
    offers: [],
    notifications: [],
    jobs: [],
    audit: [],
    roomClosures: [],
    repairRequests: [],
    repairPlans: [],
    repairConsents: [],
  };
}
export function demoState(): State {
  const s = emptyState();
  s.settings.name = "Meridian Institute of Technology";
  s.settings.term = "Odd Semester · 2026–27";
  s.departments = [
    { id: "cse", name: "Computer Science", code: "CSE", color: "violet" },
    {
      id: "ece",
      name: "Electronics & Communication",
      code: "ECE",
      color: "blue",
    },
    { id: "math", name: "Applied Sciences", code: "AS", color: "amber" },
  ];
  s.subjects = [
    {
      id: "ds",
      name: "Data Structures",
      code: "CS201",
      departmentId: "cse",
      color: "violet",
    },
    {
      id: "db",
      name: "Database Management",
      code: "CS203",
      departmentId: "cse",
      color: "blue",
    },
    {
      id: "os",
      name: "Operating Systems",
      code: "CS205",
      departmentId: "cse",
      color: "emerald",
    },
    {
      id: "math",
      name: "Discrete Mathematics",
      code: "MA201",
      departmentId: "math",
      color: "amber",
    },
    {
      id: "de",
      name: "Digital Electronics",
      code: "EC201",
      departmentId: "ece",
      color: "rose",
    },
    {
      id: "cn",
      name: "Computer Networks",
      code: "CS301",
      departmentId: "cse",
      color: "cyan",
    },
  ];
  const people = [
    ["Ananya Sharma", "cse", "Associate Professor", "ds,db"],
    ["Rohan Mehta", "cse", "Assistant Professor", "os,cn,ds"],
    ["Priya Nair", "cse", "Professor", "db,ds,os"],
    ["Arjun Patel", "ece", "Assistant Professor", "de,cn"],
    ["Sneha Iyer", "math", "Associate Professor", "math"],
    ["Vikram Singh", "cse", "Assistant Professor", "cn,os,db"],
    ["Kavya Rao", "ece", "Associate Professor", "de,cn"],
    ["Aditya Verma", "math", "Assistant Professor", "math"],
    ["Meera Joshi", "cse", "Assistant Professor", "ds,db,cn"],
    ["Ishaan Kapoor", "cse", "Professor", "os,ds"],
    ["Neha Gupta", "ece", "Assistant Professor", "de"],
    ["Rahul Desai", "math", "Professor", "math"],
  ];
  s.faculty = people.map(([name, departmentId, title, subs], i) => ({
    id: `f${i + 1}`,
    name: `Dr. ${name}`,
    email: `${name.split(" ")[0].toLowerCase()}@meridian.example`,
    departmentId,
    title,
    subjects: subs.split(","),
    target: 12,
    maxWeekly: 20,
    maxDaily: 5,
    maxConsecutive: 3,
    unavailable: [],
    preferred: ["1:0", "2:0", "3:0", "4:0", "5:0"],
  }));
  s.members = [
    {
      id: "admin",
      name: "Alex Morgan",
      email: "admin@meridian.example",
      role: "admin",
      departmentId: "cse",
    },
    {
      id: "coordinator",
      name: "Dr. Priya Nair",
      email: "coordinator@meridian.example",
      role: "coordinator",
      departmentId: "cse",
      facultyId: "f3",
    },
    ...s.faculty.map((f) => ({
      id: `m-${f.id}`,
      name: f.name,
      email: f.email,
      role: "faculty" as const,
      departmentId: f.departmentId,
      facultyId: f.id,
    })),
  ];
  s.sections = [
    { id: "s1", name: "CSE · Year 2 / A", departmentId: "cse", size: 48 },
    { id: "s2", name: "CSE · Year 2 / B", departmentId: "cse", size: 45 },
    { id: "s3", name: "CSE · Year 3 / A", departmentId: "cse", size: 42 },
    { id: "s4", name: "ECE · Year 2 / A", departmentId: "ece", size: 40 },
  ];
  s.rooms = [
    { id: "r1", name: "A-201", type: "lecture", capacity: 60 },
    { id: "r2", name: "A-202", type: "lecture", capacity: 60 },
    { id: "r3", name: "B-101", type: "lecture", capacity: 50 },
    { id: "r4", name: "B-102", type: "lecture", capacity: 50 },
    { id: "r5", name: "Computing Lab 1", type: "lab", capacity: 50 },
    { id: "r6", name: "Electronics Lab", type: "lab", capacity: 45 },
  ];
  const entries: Entry[] = [];
  const configs = [
    ["s1", "ds", "f1", "r1"],
    ["s1", "db", "f3", "r1"],
    ["s1", "math", "f5", "r1"],
    ["s1", "os", "f2", "r1"],
    ["s2", "ds", "f9", "r2"],
    ["s2", "db", "f6", "r2"],
    ["s2", "math", "f8", "r2"],
    ["s2", "os", "f10", "r2"],
    ["s3", "cn", "f6", "r3"],
    ["s3", "os", "f3", "r3"],
    ["s3", "math", "f12", "r3"],
    ["s4", "de", "f4", "r4"],
    ["s4", "math", "f8", "r4"],
  ];
  configs.forEach(([sectionId, subjectId, facultyId, roomId], i) => {
    const id = `req${i + 1}`;
    s.requirements.push({
      id,
      sectionId,
      subjectId,
      kind: "lecture",
      sessions: 3,
      duration: 1,
    });
    for (let n = 0; n < 3; n++) {
      const day = 1 + ((n + i) % 5);
      let period = [0, 1, 3, 4, 6, 7][Math.floor(i / 4) % 6];
      while (
        entries.some(
          (e) =>
            e.day === day &&
            e.period === period &&
            (e.facultyId === facultyId ||
              e.roomId === roomId ||
              s.requirements.find((r) => r.id === e.requirementId)
                ?.sectionId === sectionId),
        )
      )
        period = [0, 1, 3, 4, 6, 7][
          ([0, 1, 3, 4, 6, 7].indexOf(period) + 1) % 6
        ];
      entries.push({
        id: `e${i}-${n}`,
        requirementId: id,
        facultyId,
        roomId,
        day,
        period,
        duration: 1,
        locked: false,
      });
    }
  });
  s.versions = [
    {
      id: "v1",
      name: "Semester timetable",
      status: "published",
      entries,
      createdAt: new Date().toISOString(),
      effectiveDate: s.settings.start,
      solverStatus: "FEASIBLE",
      quality: { loadDeviation: 0, facultyGaps: 0, preferencePenalty: 0 },
      diagnostics: [
        "Synthetic example schedule. Generate a fresh timetable to optimize your own requirements.",
      ],
      sourceRevision: 0,
    },
  ];
  for (
    let date = s.settings.start;
    date <= s.settings.end;
    date = addDays(date, 1)
  )
    for (const e of entries.filter((e) => e.day === weekday(date))) {
      const req = s.requirements.find((r) => r.id === e.requirementId)!;
      s.occurrences.push({
        id: `${date}-${e.id}`,
        versionId: "v1",
        entryId: e.id,
        requirementId: e.requirementId,
        date,
        period: e.period,
        duration: e.duration,
        facultyId: e.facultyId,
        originalFacultyId: e.facultyId,
        roomId: e.roomId,
        sectionId: req.sectionId,
      });
    }
  let next = addDays(localDate(), 1);
  while (!s.settings.days.includes(weekday(next))) next = addDays(next, 1);
  const affected = s.occurrences.find(
    (o) =>
      o.date === next && ["f1", "f3", "f2", "f9", "f6"].includes(o.facultyId),
  );
  if (affected) {
    s.absences.push({
      id: "a1",
      facultyId: affected.facultyId,
      date: next,
      periods: [affected.period],
      reason: "Personal commitment",
      status: "approved",
    });
    s.coverage.push({
      id: "c1",
      absenceId: "a1",
      occurrenceId: affected.id,
      status: "uncovered",
    });
  }
  s.notifications = [
    {
      id: "n1",
      memberId: "admin",
      title: "Timetable published",
      body: "The semester timetable is published. Review coverage and workload from your workspace.",
      href: "/timetable",
      read: false,
      createdAt: new Date().toISOString(),
    },
  ];
  return s;
}
