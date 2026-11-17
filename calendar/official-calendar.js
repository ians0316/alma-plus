// Seoul Academy Upper Division 2026-2027 Academic Calendar (official school
// calendar). Events Alma's own calendar doesn't have, or has differently, shown
// on Alma's Calendar page by calendar.js. Categories follow the official legend.
// "*All schedules are subject to change." Update this list each school year.

const OFFICIAL_CALENDAR = {
  title: "Seoul Academy Upper Division Academic Calendar",
  year: "2026-2027",
  categories: {
    closed:     { label: "Building Closed",     color: "#d93a3a" },
    break:      { label: "Break",               color: "#5fbf4b" },
    faculty:    { label: "Faculty Only",        color: "#2e9b5f" },
    attendance: { label: "Attendance Required", color: "#1f4fb0" },
    shortened:  { label: "Shortened Schedule",  color: "#f28a1e" },
    info:       { label: "Other dates",         color: "#7d8a96" },
  },
  events: [
    { start: "2026-08-11", end: "2026-08-14", name: "Faculty Orientation", cat: "faculty" },
    { start: "2026-08-17", name: "Substitute Holiday", cat: "closed" },
    { start: "2026-08-18", name: "First Day for Students", cat: "shortened" },
    { start: "2026-08-18", name: "New Student Orientation", cat: "info" },
    { start: "2026-09-01", name: "Last Day to Add Classes", cat: "info" },
    { start: "2026-09-21", end: "2026-09-25", name: "Chuseok Break", cat: "closed" },
    { start: "2026-10-05", name: "Substitute Holiday", cat: "closed" },
    { start: "2026-10-09", name: "Hangul Day", cat: "closed" },
    { start: "2026-10-23", name: "Parent-Teacher Conference", cat: "faculty" },
    { start: "2026-10-30", name: "Sports Day", cat: "attendance" },
    { start: "2026-11-06", name: "Last Day to Drop Classes Without a W", cat: "info" },
    { start: "2026-12-14", end: "2026-12-18", name: "Final Exam Week", cat: "info" },
    { start: "2026-12-18", name: "Award Assembly", cat: "attendance" },
    { start: "2026-12-21", end: "2027-01-08", name: "Winter Break", cat: "break" },
    { start: "2027-01-04", end: "2027-01-08", name: "Faculty Workshop", cat: "faculty" },
    { start: "2027-01-11", name: "First Day for Students", cat: "shortened" },
    { start: "2027-02-08", end: "2027-02-09", name: "Lunar New Year Break", cat: "closed" },
    { start: "2027-03-01", name: "Independence Movement Day", cat: "closed" },
    { start: "2027-03-23", name: "Parent-Teacher Conference", cat: "faculty" },
    { start: "2027-03-25", end: "2027-03-26", name: "Overnight Field Trip", cat: "attendance" },
    { start: "2027-03-29", end: "2027-04-02", name: "Spring Break", cat: "break" },
    { start: "2027-04-06", name: "Photo Day", cat: "info" },
    { start: "2027-04-30", name: "STUCO Election for 2027-2028", cat: "info" },
    { start: "2027-05-05", name: "Children's Day", cat: "closed" },
    { start: "2027-05-13", name: "Buddha's Birthday", cat: "closed" },
    { start: "2027-05-25", end: "2027-05-31", name: "Final Exam Week", cat: "info" },
    { start: "2027-05-31", name: "Award Assembly", cat: "attendance" },
  ],
};
