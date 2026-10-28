import EventKit
import Foundation
import AppKit

struct Options {
  var mode = "search"
  var startMs: Double?
  var endMs: Double?
  var calendarName: String?
  var query: String?
  var eventId: String?
  var title: String?
  var windowStartMs: Double?
  var windowEndMs: Double?
  var newTitle: String?
  var location: String?
  var notes: String?
}

func fail(_ message: String) -> Never {
  fputs("\(message)\n", stderr)
  exit(1)
}

func usage() -> Never {
  fail("""
Usage:
  nico-apple-cal
  nico-apple-cal --doctor
  nico-apple-cal --start-ms <epoch-ms> --end-ms <epoch-ms> [--calendar <name>] [--query <text>]
  nico-apple-cal --create-event --title <title> --start-ms <epoch-ms> --end-ms <epoch-ms> [--calendar <name>] [--location <text>] [--notes <text>]
  nico-apple-cal --update-event (--event-id <id> | --title <title>) [--calendar <name>] [--window-start-ms <epoch-ms> --window-end-ms <epoch-ms>] [--new-title <title>] [--start-ms <epoch-ms>] [--end-ms <epoch-ms>] [--location <text>] [--notes <text>]
  nico-apple-cal --delete-event (--event-id <id> | --title <title>) [--calendar <name>] [--window-start-ms <epoch-ms> --window-end-ms <epoch-ms>]

""")
}

func parseOptions(_ args: [String]) -> Options {
  var options = Options()
  var i = 0
  func value() -> String {
    guard i + 1 < args.count else { fail("Missing value for \(args[i])") }
    i += 1
    return args[i]
  }
  func number() -> Double {
    let flag = args[i]
    guard let number = Double(value()) else { fail("Missing or invalid value for \(flag)") }
    return number
  }
  while i < args.count {
    switch args[i] {
    case "--doctor": options.mode = "doctor"
    case "--create-event": options.mode = "create"
    case "--update-event": options.mode = "update"
    case "--delete-event": options.mode = "delete"
    case "--start-ms": options.startMs = number()
    case "--end-ms": options.endMs = number()
    case "--calendar": options.calendarName = value()
    case "--query": options.query = value()
    case "--event-id": options.eventId = value()
    case "--title": options.title = value()
    case "--window-start-ms": options.windowStartMs = number()
    case "--window-end-ms": options.windowEndMs = number()
    case "--new-title": options.newTitle = value()
    case "--location": options.location = value()
    case "--notes": options.notes = value()
    default: usage()
    }
    i += 1
  }
  return options
}

func calendarAuthorizationStatus() -> String {
  switch EKEventStore.authorizationStatus(for: .event) {
  case .authorized: return "authorized"
  case .denied: return "denied"
  case .notDetermined: return "notDetermined"
  case .restricted: return "restricted"
  case .fullAccess: return "fullAccess"
  case .writeOnly: return "writeOnly"
  @unknown default: return "unknown"
  }
}

func ensureCalendarAccess(_ store: EKEventStore) {
  if ["fullAccess", "authorized"].contains(calendarAuthorizationStatus()) { return }

  NSApplication.shared.setActivationPolicy(.regular)
  NSApplication.shared.activate(ignoringOtherApps: true)

  let sem = DispatchSemaphore(value: 0)
  var granted = false
  var accessError: Error?

  if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { ok, err in
      granted = ok
      accessError = err
      sem.signal()
    }
  } else {
    store.requestAccess(to: .event) { ok, err in
      granted = ok
      accessError = err
      sem.signal()
    }
  }

  if sem.wait(timeout: .now() + 20) == .timedOut {
    fail("Calendar permission prompt timed out. Approve NicoAppleMCPCalendarHelper in System Settings > Privacy & Security > Calendars, then retry.")
  }

  if !granted {
    let detail = accessError.map { ": \($0.localizedDescription)" } ?? ""
    fail("Calendar permission denied\(detail). Grant calendar access in System Settings > Privacy & Security > Calendars.")
  }
}

func dateFromMs(_ value: Double) -> Date {
  Date(timeIntervalSince1970: value / 1000)
}

func outputJson(_ object: Any) {
  do {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
    print(String(decoding: data, as: UTF8.self))
  } catch {
    fail("JSON serialization failed: \(error.localizedDescription)")
  }
}

func email(_ url: URL?) -> String {
  guard let url = url?.absoluteString, url.hasPrefix("mailto:") else { return "" }
  return String(url.dropFirst(7))
}

func eventJson(_ event: EKEvent) -> [String: Any] {
  let status: String
  switch event.status {
  case .none: status = "none"
  case .confirmed: status = "confirmed"
  case .tentative: status = "tentative"
  case .canceled: status = "canceled"
  @unknown default: status = "none"
  }
  let attendees: [[String: Any]] = (event.attendees ?? []).map { participant in
    let role: String
    switch participant.participantRole {
    case .unknown: role = "unknown"
    case .required: role = "required"
    case .optional: role = "optional"
    case .chair: role = "chair"
    case .nonParticipant: role = "non-participant"
    @unknown default: role = "unknown"
    }
    let pStatus: String
    switch participant.participantStatus {
    case .unknown: pStatus = "unknown"
    case .pending: pStatus = "pending"
    case .accepted: pStatus = "accepted"
    case .declined: pStatus = "declined"
    case .tentative: pStatus = "tentative"
    case .delegated: pStatus = "delegated"
    case .completed: pStatus = "completed"
    case .inProcess: pStatus = "in-process"
    @unknown default: pStatus = "unknown"
    }
    let pType: String
    switch participant.participantType {
    case .unknown: pType = "unknown"
    case .person: pType = "person"
    case .room: pType = "room"
    case .resource: pType = "resource"
    case .group: pType = "group"
    @unknown default: pType = "unknown"
    }
    return [
      "name": participant.name ?? "",
      "email": email(participant.url),
      "role": role,
      "status": pStatus,
      "type": pType,
      "isCurrentUser": participant.isCurrentUser,
    ]
  }
  return [
    "eventId": event.eventIdentifier ?? "",
    "calendar": event.calendar.title,
    "title": event.title ?? "",
    "startMs": Int(event.startDate.timeIntervalSince1970 * 1000),
    "endMs": Int(event.endDate.timeIntervalSince1970 * 1000),
    "location": event.location ?? "",
    "notes": event.notes ?? "",
    "isAllDay": event.isAllDay,
    "status": status,
    "organizer": [
      "name": event.organizer?.name ?? "",
      "email": email(event.organizer?.url),
      "isCurrentUser": event.organizer?.isCurrentUser ?? false,
    ] as [String: Any],
    "attendees": attendees,
  ]
}

func calendars(named name: String, in store: EKEventStore) -> [EKCalendar] {
  let matches = store.calendars(for: .event).filter { $0.title == name }
  if matches.isEmpty { fail("Calendar not found: \(name)") }
  return matches
}

func calendarForNewEvent(named name: String?, in store: EKEventStore) -> EKCalendar {
  guard let name else {
    guard let calendar = store.defaultCalendarForNewEvents else { fail("Default calendar not found") }
    return calendar
  }
  let matches = calendars(named: name, in: store)
  if matches.count > 1 { fail("Multiple calendars match: \(name)") }
  return matches[0]
}

/// Event occurrences overlapping start..<end, queried in 3-year chunks because EventKit caps a predicate at 4 years.
/// Repeating events yield one entry per occurrence, all sharing one eventIdentifier.
/// EventKit also returns events that only touch the range, such as one ending exactly at `start`, so they are dropped.
func occurrences(from start: Date, to end: Date, calendars: [EKCalendar]?, store: EKEventStore) -> [EKEvent] {
  var matches: [EKEvent] = []
  var seen = Set<String>()
  var cursor = start
  while cursor < end {
    let next = min(Calendar.current.date(byAdding: .year, value: 3, to: cursor)!, end)
    let predicate = store.predicateForEvents(withStart: cursor, end: next, calendars: calendars)
    for event in store.events(matching: predicate) where event.startDate < end && event.endDate > start {
      // An event spanning a chunk boundary comes back from both chunks.
      let key = "\(event.eventIdentifier ?? "")|\(event.calendar.calendarIdentifier)|\(event.startDate.timeIntervalSince1970)|\(event.title ?? "")"
      if seen.insert(key).inserted { matches.append(event) }
    }
    cursor = next
  }
  return matches
}

/// The one event occurrence an update or delete changes.
/// EventKit's lookup by eventIdentifier returns a repeating event's first occurrence, so a repeating
/// event is found by searching a window around the occurrence instead.
func targetOccurrence(_ options: Options, store: EKEventStore) -> EKEvent {
  if (options.windowStartMs == nil) != (options.windowEndMs == nil) {
    fail("--window-start-ms and --window-end-ms must be provided together")
  }
  let window = options.windowStartMs.flatMap { start in options.windowEndMs.map { (dateFromMs(start), dateFromMs($0)) } }
  if let window, window.0 >= window.1 { fail("--window-start-ms must be before --window-end-ms") }

  if let eventId = options.eventId, window == nil {
    guard let event = store.event(withIdentifier: eventId) else { fail("Event not found for eventId: \(eventId)") }
    if event.hasRecurrenceRules {
      fail("\(event.title ?? eventId) is a repeating event. Pass windowStart and windowEnd around the occurrence to change.")
    }
    if let calendarName = options.calendarName, event.calendar.title != calendarName {
      fail("Event does not match calendar: expected \(calendarName), found \(event.calendar.title)")
    }
    if let title = options.title, event.title != title {
      fail("Event does not match title: expected \(title), found \(event.title ?? "(no title)")")
    }
    return event
  }

  guard options.eventId != nil || options.title != nil else { fail("Missing --event-id or --title") }
  let label = options.title ?? "eventId \(options.eventId!)"
  let (start, end) = window ?? (dateFromMs(0), Calendar.current.date(from: DateComponents(year: 2100, month: 1, day: 1))!)
  let matches = occurrences(
    from: start,
    to: end,
    calendars: options.calendarName.map { calendars(named: $0, in: store) },
    store: store
  ).filter { event in
    (options.eventId == nil || event.eventIdentifier == options.eventId) && (options.title == nil || event.title == options.title)
  }
  if matches.isEmpty { fail("Event not found: \(label)") }
  if matches.count > 1 {
    let hint = options.eventId == nil ? "Use eventId or add windowStart/windowEnd." : "Narrow windowStart/windowEnd to one occurrence."
    fail("Multiple events match: \(label). \(hint)")
  }
  return matches[0]
}

func save(_ event: EKEvent, in store: EKEventStore) {
  do {
    try store.save(event, span: .thisEvent, commit: true)
  } catch {
    fail("Calendar save failed: \(error.localizedDescription)")
  }
}

func remove(_ event: EKEvent, in store: EKEventStore) {
  do {
    try store.remove(event, span: .thisEvent, commit: true)
  } catch {
    fail("Calendar delete failed: \(error.localizedDescription)")
  }
}

let options = parseOptions(Array(CommandLine.arguments.dropFirst()))
let store = EKEventStore()

if options.mode == "doctor" {
  print("nico-apple-cal ok\ncalendar authorization: \(calendarAuthorizationStatus())")
  exit(0)
}

ensureCalendarAccess(store)

switch options.mode {
case "search" where options.startMs == nil && options.endMs == nil && options.calendarName == nil && options.query == nil:
  outputJson([
    "calendars": store.calendars(for: .event).map { ["title": $0.title, "identifier": $0.calendarIdentifier] }
  ])

case "search":
  guard let startMs = options.startMs, let endMs = options.endMs else { usage() }
  let predicate = store.predicateForEvents(
    withStart: dateFromMs(startMs),
    end: dateFromMs(endMs),
    calendars: options.calendarName.map { calendars(named: $0, in: store) }
  )
  var events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
  if let query = options.query, !query.isEmpty {
    let needle = query.localizedLowercase
    events = events.filter { event in
      [event.title, event.location, event.notes].contains { $0?.localizedLowercase.contains(needle) == true }
    }
  }
  outputJson(["events": events.map(eventJson)])

case "create":
  guard let title = options.title, let startMs = options.startMs, let endMs = options.endMs else { usage() }
  let event = EKEvent(eventStore: store)
  event.title = title
  event.startDate = dateFromMs(startMs)
  event.endDate = dateFromMs(endMs)
  event.calendar = calendarForNewEvent(named: options.calendarName, in: store)
  if let location = options.location { event.location = location }
  if let notes = options.notes { event.notes = notes }
  save(event, in: store)
  outputJson(["created": eventJson(event)])

case "update":
  let event = targetOccurrence(options, store: store)
  if options.newTitle == nil && options.startMs == nil && options.endMs == nil && options.location == nil && options.notes == nil {
    fail("No updates specified")
  }
  if let newTitle = options.newTitle { event.title = newTitle }
  if let startMs = options.startMs { event.startDate = dateFromMs(startMs) }
  if let endMs = options.endMs { event.endDate = dateFromMs(endMs) }
  if let location = options.location { event.location = location }
  if let notes = options.notes { event.notes = notes }
  save(event, in: store)
  outputJson(["updated": eventJson(event)])

case "delete":
  let event = targetOccurrence(options, store: store)
  let deleted = eventJson(event)
  remove(event, in: store)
  outputJson(["deleted": deleted])

default:
  usage()
}
