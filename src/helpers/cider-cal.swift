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
  var resultFile: String?
}

func usage() -> Never {
  fputs("""
Usage:
  cider-cal
  cider-cal --doctor
  cider-cal --start-ms <epoch-ms> --end-ms <epoch-ms> [--calendar <name>] [--query <text>]
  cider-cal --create-event --title <title> --start-ms <epoch-ms> --end-ms <epoch-ms> [--calendar <name>] [--location <text>] [--notes <text>]
  cider-cal --update-event (--event-id <id> | --title <title>) [--calendar <name>] [--window-start-ms <epoch-ms> --window-end-ms <epoch-ms>] [--new-title <title>] [--start-ms <epoch-ms>] [--end-ms <epoch-ms>] [--location <text>] [--notes <text>]
  cider-cal --delete-event (--event-id <id> | --title <title>) [--calendar <name>] [--window-start-ms <epoch-ms> --window-end-ms <epoch-ms>]

""", stderr)
  exit(1)
}

func requireValue(_ args: [String], _ index: Int, _ flag: String) -> String {
  guard index + 1 < args.count else {
    fputs("Missing value for \(flag)\n", stderr)
    exit(1)
  }
  return args[index + 1]
}

func parseOptions(_ args: [String]) -> Options? {
  var options = Options()
  var i = 0
  while i < args.count {
    switch args[i] {
    case "--doctor":
      options.mode = "doctor"
      i += 1
    case "--result-file":
      options.resultFile = requireValue(args, i, "--result-file")
      i += 2
    case "--create-event":
      options.mode = "create"
      i += 1
    case "--update-event":
      options.mode = "update"
      i += 1
    case "--delete-event":
      options.mode = "delete"
      i += 1
    case "--start-ms":
      let raw = requireValue(args, i, "--start-ms")
      guard let value = Double(raw) else {
        fputs("Missing or invalid value for --start-ms\n", stderr)
        exit(1)
      }
      options.startMs = value
      i += 2
    case "--end-ms":
      let raw = requireValue(args, i, "--end-ms")
      guard let value = Double(raw) else {
        fputs("Missing or invalid value for --end-ms\n", stderr)
        exit(1)
      }
      options.endMs = value
      i += 2
    case "--calendar":
      options.calendarName = requireValue(args, i, "--calendar")
      i += 2
    case "--query":
      options.query = requireValue(args, i, "--query")
      i += 2
    case "--event-id":
      options.eventId = requireValue(args, i, "--event-id")
      i += 2
    case "--title":
      options.title = requireValue(args, i, "--title")
      i += 2
    case "--window-start-ms":
      let raw = requireValue(args, i, "--window-start-ms")
      guard let value = Double(raw) else {
        fputs("Missing or invalid value for --window-start-ms\n", stderr)
        exit(1)
      }
      options.windowStartMs = value
      i += 2
    case "--window-end-ms":
      let raw = requireValue(args, i, "--window-end-ms")
      guard let value = Double(raw) else {
        fputs("Missing or invalid value for --window-end-ms\n", stderr)
        exit(1)
      }
      options.windowEndMs = value
      i += 2
    case "--new-title":
      options.newTitle = requireValue(args, i, "--new-title")
      i += 2
    case "--location":
      options.location = requireValue(args, i, "--location")
      i += 2
    case "--notes":
      options.notes = requireValue(args, i, "--notes")
      i += 2
    default:
      usage()
    }
  }
  return options
}

func calendarAuthorizationStatus() -> String {
  let status = EKEventStore.authorizationStatus(for: .event)
  switch status {
  case .authorized:
    return "authorized"
  case .denied:
    return "denied"
  case .notDetermined:
    return "notDetermined"
  case .restricted:
    return "restricted"
  case .fullAccess:
    return "fullAccess"
  case .writeOnly:
    return "writeOnly"
  @unknown default:
    return "unknown"
  }
}

func requestCalendarAccess(_ store: EKEventStore) {
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
    fputs("Calendar permission prompt timed out. Approve CiderCalendarHelper in System Settings > Privacy & Security > Calendars, then retry.\n", stderr)
    exit(1)
  }

  if !granted {
    let detail = accessError.map { ": \($0.localizedDescription)" } ?? ""
    fputs("Calendar permission denied\(detail). Grant calendar access in System Settings > Privacy & Security > Calendars.\n", stderr)
    exit(1)
  }
}

func dateFromMs(_ value: Double) -> Date {
  Date(timeIntervalSince1970: value / 1000)
}

func writeOutput(_ text: String, options: Options) {
  if let resultFile = options.resultFile {
    do {
      try text.write(toFile: resultFile, atomically: true, encoding: .utf8)
    } catch {
      fputs("Failed to write result file: \(error.localizedDescription)\n", stderr)
      exit(1)
    }
    return
  }
  print(text)
}

func outputJson(_ object: Any, options: Options) {
  do {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
    writeOutput(String(data: data, encoding: .utf8)!, options: options)
  } catch {
    fputs("JSON serialization failed: \(error.localizedDescription)\n", stderr)
    exit(1)
  }
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
      "email": participant.url.absoluteString.hasPrefix("mailto:") ? String(participant.url.absoluteString.dropFirst(7)) : "",
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
      "email": event.organizer?.url.absoluteString.hasPrefix("mailto:") == true ? String(event.organizer!.url.absoluteString.dropFirst(7)) : "",
      "isCurrentUser": event.organizer?.isCurrentUser ?? false,
    ] as [String: Any],
    "attendees": attendees,
  ]
}

func calendars(matching name: String?, in store: EKEventStore) -> [EKCalendar]? {
  guard let name else { return nil }
  let matches = store.calendars(for: .event).filter { $0.title == name }
  if matches.isEmpty {
    fputs("Calendar not found: \(name)\n", stderr)
    exit(1)
  }
  return matches
}

func requiredCalendar(named name: String?, in store: EKEventStore) -> EKCalendar {
  guard let name else {
    guard let calendar = store.defaultCalendarForNewEvents else {
      fputs("Default calendar not found\n", stderr)
      exit(1)
    }
    return calendar
  }

  let matches = store.calendars(for: .event).filter { $0.title == name }
  if matches.isEmpty {
    fputs("Calendar not found: \(name)\n", stderr)
    exit(1)
  }
  if matches.count > 1 {
    fputs("Multiple calendars match: \(name)\n", stderr)
    exit(1)
  }
  return matches[0]
}

func eventKey(_ event: EKEvent) -> String {
  event.eventIdentifier ?? "\(event.calendar.calendarIdentifier)-\(event.startDate.timeIntervalSince1970)-\(event.title ?? "")"
}

func eventById(_ eventId: String, store: EKEventStore) -> EKEvent {
  guard let event = store.event(withIdentifier: eventId) else {
    fputs("Event not found for eventId: \(eventId)\n", stderr)
    exit(1)
  }
  return event
}

func validateEventNarrowing(_ event: EKEvent, options: Options) {
  if let calendarName = options.calendarName, event.calendar.title != calendarName {
    fputs("Event does not match calendar: expected \(calendarName), found \(event.calendar.title)\n", stderr)
    exit(1)
  }

  if let title = options.title, event.title != title {
    fputs("Event does not match title: expected \(title), found \(event.title ?? "(no title)")\n", stderr)
    exit(1)
  }

  if (options.windowStartMs == nil) != (options.windowEndMs == nil) {
    fputs("--window-start-ms and --window-end-ms must be provided together\n", stderr)
    exit(1)
  }

  guard let windowStartMs = options.windowStartMs, let windowEndMs = options.windowEndMs else { return }
  let windowStart = dateFromMs(windowStartMs)
  let windowEnd = dateFromMs(windowEndMs)
  if windowStart >= windowEnd {
    fputs("--window-start-ms must be before --window-end-ms\n", stderr)
    exit(1)
  }

  // Conservative overlap rule for eventId narrowing: the event must intersect
  // the bounded target window, not sit entirely before or after it.
  if !(event.startDate < windowEnd && event.endDate > windowStart) {
    fputs("Event does not overlap windowStart/windowEnd\n", stderr)
    exit(1)
  }
}

func eventsByExactTitle(_ title: String, calendarName: String?, windowStart: Date?, windowEnd: Date?, store: EKEventStore) -> [EKEvent] {
  let targetCalendars = calendarName.map { [requiredCalendar(named: $0, in: store)] }
  return eventsByExactTitle(title, calendars: targetCalendars, windowStart: windowStart, windowEnd: windowEnd, store: store)
}

func eventsByExactTitle(_ title: String, calendars: [EKCalendar]?, windowStart: Date?, windowEnd: Date?, store: EKEventStore) -> [EKEvent] {
  let calendar = Calendar.current
  var matches: [EKEvent] = []
  var seen = Set<String>()
  var cursor = windowStart ?? calendar.date(from: DateComponents(year: 1970, month: 1, day: 1))!
  let end = windowEnd ?? calendar.date(from: DateComponents(year: 2100, month: 1, day: 1))!

  while cursor < end {
    let next = min(calendar.date(byAdding: .year, value: 3, to: cursor)!, end)
    let predicate = store.predicateForEvents(withStart: cursor, end: next, calendars: calendars)
    for event in store.events(matching: predicate) where event.title == title {
      let key = eventKey(event)
      if !seen.contains(key) {
        seen.insert(key)
        matches.append(event)
      }
    }
    cursor = next
  }

  return matches
}

func requireSingleEvent(options: Options, store: EKEventStore) -> EKEvent {
  if (options.windowStartMs == nil) != (options.windowEndMs == nil) {
    fputs("--window-start-ms and --window-end-ms must be provided together\n", stderr)
    exit(1)
  }

  if let eventId = options.eventId {
    let event = eventById(eventId, store: store)
    validateEventNarrowing(event, options: options)
    return event
  }

  guard let title = options.title else {
    fputs("Missing --event-id or --title\n", stderr)
    exit(1)
  }

  let windowStart = options.windowStartMs.map { dateFromMs($0) }
  let windowEnd = options.windowEndMs.map { dateFromMs($0) }
  let matches = eventsByExactTitle(title, calendarName: options.calendarName, windowStart: windowStart, windowEnd: windowEnd, store: store)
  if matches.isEmpty {
    fputs("Event not found: \(title)\n", stderr)
    exit(1)
  }
  if matches.count > 1 {
    fputs("Multiple events match: \(title). Use eventId or add windowStart/windowEnd.\n", stderr)
    exit(1)
  }
  return matches[0]
}

func save(_ event: EKEvent, in store: EKEventStore) {
  do {
    try store.save(event, span: .thisEvent, commit: true)
  } catch {
    fputs("Calendar save failed: \(error.localizedDescription)\n", stderr)
    exit(1)
  }
}

func remove(_ event: EKEvent, in store: EKEventStore) {
  do {
    try store.remove(event, span: .thisEvent, commit: true)
  } catch {
    fputs("Calendar delete failed: \(error.localizedDescription)\n", stderr)
    exit(1)
  }
}

let args = Array(CommandLine.arguments.dropFirst())
guard let options = parseOptions(args) else { usage() }

let store = EKEventStore()

if options.mode == "doctor" {
  writeOutput("cider-cal ok\ncalendar authorization: \(calendarAuthorizationStatus())", options: options)
  exit(0)
}

requestCalendarAccess(store)

if options.mode == "search" && options.startMs == nil && options.endMs == nil && options.calendarName == nil && options.query == nil {
  outputJson([
    "calendars": store.calendars(for: .event).map {
      [
        "title": $0.title,
        "identifier": $0.calendarIdentifier,
      ]
    }
  ], options: options)
  exit(0)
}

switch options.mode {
case "search":
  guard let startMs = options.startMs, let endMs = options.endMs else { usage() }
  let start = dateFromMs(startMs)
  let end = dateFromMs(endMs)
  let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars(matching: options.calendarName, in: store))
  var events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }

  if let query = options.query, !query.isEmpty {
    let needle = query.localizedLowercase
    events = events.filter { event in
      let haystacks = [event.title, event.location, event.notes].compactMap { $0?.localizedLowercase }
      return haystacks.contains { $0.contains(needle) }
    }
  }

  outputJson([
    "events": events.map { eventJson($0) }
  ], options: options)

case "create":
  guard let title = options.title, let startMs = options.startMs, let endMs = options.endMs else { usage() }
  let event = EKEvent(eventStore: store)
  event.title = title
  event.startDate = dateFromMs(startMs)
  event.endDate = dateFromMs(endMs)
  event.calendar = requiredCalendar(named: options.calendarName, in: store)
  if let location = options.location { event.location = location }
  if let notes = options.notes { event.notes = notes }
  save(event, in: store)
  outputJson(["created": eventJson(event)], options: options)

case "update":
  let event = requireSingleEvent(options: options, store: store)
  var didUpdate = false
  if let newTitle = options.newTitle {
    event.title = newTitle
    didUpdate = true
  }
  if let startMs = options.startMs {
    event.startDate = dateFromMs(startMs)
    didUpdate = true
  }
  if let endMs = options.endMs {
    event.endDate = dateFromMs(endMs)
    didUpdate = true
  }
  if let location = options.location {
    event.location = location
    didUpdate = true
  }
  if let notes = options.notes {
    event.notes = notes
    didUpdate = true
  }
  if !didUpdate {
    fputs("No updates specified\n", stderr)
    exit(1)
  }
  save(event, in: store)
  outputJson(["updated": eventJson(event)], options: options)

case "delete":
  let event = requireSingleEvent(options: options, store: store)
  let deleted = eventJson(event)
  remove(event, in: store)
  outputJson(["deleted": deleted], options: options)

default:
  usage()
}
