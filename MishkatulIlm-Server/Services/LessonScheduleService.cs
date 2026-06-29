using MishkatulIlm_Server.Data;
using MishkatulIlm_Server.Dtos;

namespace MishkatulIlm_Server.Services;

/// <summary>Lesson grid 8:00–22:00 UTC (30-minute steps) and booking from admin-selected week-one slots.</summary>
public static class LessonScheduleService
{
    public const int BookingWeeks = 4;
    public const int DayStartHour = 8;
    /// <summary>Last allowed lesson end hour (10pm UTC).</summary>
    public const int DayEndHour = 22;
    public const int GridStepMinutes = 30;

    public static readonly int[] AllowedDurationMinutes =
        Enumerable.Range(2, 7).Select(i => i * 15).ToArray(); // 30–120 in 15-minute steps

    private static readonly TimeSpan DayOpen = TimeSpan.FromHours(DayStartHour);
    private static readonly TimeSpan DayClose = TimeSpan.FromHours(DayEndHour);

    public static bool TryNormalizeDuration(int durationMinutes, out int normalized, out string? error)
    {
        normalized = durationMinutes;
        if (durationMinutes is >= 30 and <= 120 && durationMinutes % 15 == 0)
        {
            error = null;
            return true;
        }

        error = "Lesson duration must be between 30 and 120 minutes in 15-minute steps.";
        normalized = 0;
        return false;
    }

    public static DateTime SlotEnd(DateTime startsAtUtc, int durationMinutes) =>
        DateTime.SpecifyKind(startsAtUtc, DateTimeKind.Utc).AddMinutes(durationMinutes);

    public static bool FitsDayWindow(DateTime startUtc, int durationMinutes)
    {
        startUtc = DateTime.SpecifyKind(startUtc, DateTimeKind.Utc);
        var start = startUtc.TimeOfDay;
        var end = start.Add(TimeSpan.FromMinutes(durationMinutes));
        return start >= DayOpen && end <= DayClose;
    }

    public static int RequiredWeekOneSlotCount(string lessonFrequency) =>
        lessonFrequency.Trim().ToUpperInvariant() switch
        {
            "TWICE-WEEK" => 2,
            "THREE-WEEK" => 3,
            "FOUR-PLUS-WEEK" => 4,
            _ => 1,
        };

    public static DateTime CalendarWeekStartUtc(DateTime instantUtc)
    {
        var date = DateTime.SpecifyKind(instantUtc, DateTimeKind.Utc).Date;
        var offset = ((int)date.DayOfWeek - (int)DayOfWeek.Monday + 7) % 7;
        return DateTime.SpecifyKind(date.AddDays(-offset), DateTimeKind.Utc);
    }

    public static bool Overlaps(DateTime startA, int durationA, DateTime startB, int durationB)
    {
        var endA = SlotEnd(startA, durationA);
        var endB = SlotEnd(startB, durationB);
        return startA < endB && startB < endA;
    }

    public static bool HasBookingConflict(
        DateTime startUtc,
        int durationMinutes,
        IReadOnlyList<LessonSlot> booked) =>
        booked.Any(b =>
            b.StartsAtUtc < SlotEnd(startUtc, durationMinutes)
            && b.EndsAtUtc > startUtc);

    public static List<int> GetAvailableDurationsForStart(
        DateTime startUtc,
        IReadOnlyList<LessonSlot> booked)
    {
        var list = new List<int>();
        foreach (var duration in AllowedDurationMinutes)
        {
            if (!FitsDayWindow(startUtc, duration))
                continue;
            if (HasBookingConflict(startUtc, duration, booked))
                continue;
            list.Add(duration);
        }

        return list;
    }

    public static bool TryValidateWeekOneLessons(
        IReadOnlyList<WeekOneLessonSlotDto> weekOneLessons,
        string lessonFrequency,
        out string? error,
        bool requireExactWeekOneCount = true)
    {
        error = null;
        var required = RequiredWeekOneSlotCount(lessonFrequency);
        var lessons = weekOneLessons
            .Select(l => new WeekOneLessonSlotDto
            {
                StartsAtUtc = DateTime.SpecifyKind(l.StartsAtUtc, DateTimeKind.Utc),
                DurationMinutes = l.DurationMinutes,
            })
            .OrderBy(l => l.StartsAtUtc)
            .ToList();

        if (lessons.Count == 0)
            return !requireExactWeekOneCount;

        if (requireExactWeekOneCount && lessons.Count != required)
        {
            error = required switch
            {
                1 => "Select one lesson slot in the start week.",
                2 => "Select two lesson slots in the start week (twice per week).",
                3 => "Select three lesson slots in the start week.",
                4 => "Select four lesson slots in the start week.",
                _ => $"Select {required} lesson slots in the start week.",
            };
            return false;
        }

        if (lessons.Select(l => l.StartsAtUtc).Distinct().Count() != lessons.Count)
        {
            error = "Each selected start time must be unique.";
            return false;
        }

        foreach (var lesson in lessons)
        {
            if (!TryNormalizeDuration(lesson.DurationMinutes, out _, out error))
                return false;

            if (lesson.StartsAtUtc < DateTime.UtcNow.AddMinutes(-5))
            {
                error = "Cannot schedule lessons in the past.";
                return false;
            }

            if (!FitsDayWindow(lesson.StartsAtUtc, lesson.DurationMinutes))
            {
                error =
                    $"Lesson at {lesson.StartsAtUtc:u} does not fit between {DayStartHour}:00 and {DayEndHour}:00 UTC.";
                return false;
            }
        }

        if (requireExactWeekOneCount)
        {
            var weekStart = CalendarWeekStartUtc(lessons[0].StartsAtUtc);
            if (lessons.Any(l => CalendarWeekStartUtc(l.StartsAtUtc) != weekStart))
            {
                error = "All selected slots must be in the same calendar week.";
                return false;
            }
        }

        for (var i = 0; i < lessons.Count; i++)
        {
            for (var j = i + 1; j < lessons.Count; j++)
            {
                if (Overlaps(
                        lessons[i].StartsAtUtc,
                        lessons[i].DurationMinutes,
                        lessons[j].StartsAtUtc,
                        lessons[j].DurationMinutes))
                {
                    error = "Selected lessons overlap. Adjust start times or durations.";
                    return false;
                }
            }
        }

        return true;
    }

    /// <summary>Repeat each week-one lesson (with its duration) for <see cref="BookingWeeks"/> weeks.</summary>
    public static List<PlannedLessonSlotDto> PlanFromWeekOneLessons(
        IReadOnlyList<WeekOneLessonSlotDto> weekOneLessons,
        string lessonFrequency)
    {
        var freq = lessonFrequency.Trim().ToUpperInvariant();
        var weekOne = weekOneLessons
            .Select(l => new WeekOneLessonSlotDto
            {
                StartsAtUtc = DateTime.SpecifyKind(l.StartsAtUtc, DateTimeKind.Utc),
                DurationMinutes = l.DurationMinutes,
            })
            .OrderBy(l => l.StartsAtUtc)
            .ToList();

        if (weekOne.Count == 0)
            return [];

        var results = new List<PlannedLessonSlotDto>();
        for (var week = 0; week < BookingWeeks; week++)
        {
            if (freq == "BIWEEKLY" && week % 2 != 0)
                continue;

            foreach (var lesson in weekOne)
            {
                var start = lesson.StartsAtUtc.AddDays(week * 7);
                results.Add(
                    new PlannedLessonSlotDto
                    {
                        StartsAtUtc = start,
                        EndsAtUtc = SlotEnd(start, lesson.DurationMinutes),
                        DurationMinutes = lesson.DurationMinutes,
                    });
            }
        }

        return results
            .OrderBy(l => l.StartsAtUtc)
            .ToList();
    }

    /// <summary>
    /// Reads week-one templates from the student's most recent <see cref="BookingWeeks"/> block
    /// (used when auto-rolling lessons forward).
    /// </summary>
    public static List<WeekOneLessonSlotDto> ExtractWeekOneLessonsFromLastBlock(
        IReadOnlyList<(DateTime StartsAtUtc, DateTime EndsAtUtc)> lessons)
    {
        if (lessons.Count == 0)
            return [];

        var ordered = lessons
            .Select(l => (
                StartsAtUtc: DateTime.SpecifyKind(l.StartsAtUtc, DateTimeKind.Utc),
                EndsAtUtc: DateTime.SpecifyKind(l.EndsAtUtc, DateTimeKind.Utc)))
            .OrderBy(l => l.StartsAtUtc)
            .ToList();

        var lastStart = ordered[^1].StartsAtUtc;
        var blockWeekOneStart = CalendarWeekStartUtc(lastStart).AddDays(-7 * (BookingWeeks - 1));

        return ordered
            .Where(l => CalendarWeekStartUtc(l.StartsAtUtc) == blockWeekOneStart)
            .Select(l => new WeekOneLessonSlotDto
            {
                StartsAtUtc = l.StartsAtUtc,
                DurationMinutes = Math.Max(1, (int)Math.Round((l.EndsAtUtc - l.StartsAtUtc).TotalMinutes)),
            })
            .OrderBy(l => l.StartsAtUtc)
            .ToList();
    }

    /// <summary>Plans the next <see cref="BookingWeeks"/> block immediately after the previous week-one templates.</summary>
    public static List<PlannedLessonSlotDto> PlanRolloverBlock(
        IReadOnlyList<WeekOneLessonSlotDto> previousWeekOne,
        string lessonFrequency)
    {
        if (previousWeekOne.Count == 0)
            return [];

        var nextWeekOne = previousWeekOne
            .Select(l => new WeekOneLessonSlotDto
            {
                StartsAtUtc = DateTime.SpecifyKind(l.StartsAtUtc, DateTimeKind.Utc).AddDays(7 * BookingWeeks),
                DurationMinutes = l.DurationMinutes,
            })
            .ToList();

        return PlanFromWeekOneLessons(nextWeekOne, lessonFrequency);
    }

    /// <summary>Legacy: single duration for all week-one starts.</summary>
    public static bool TryValidateWeekOneSlots(
        IReadOnlyList<DateTime> weekOneStartsUtc,
        string lessonFrequency,
        int durationMinutes,
        out string? error)
    {
        var lessons = weekOneStartsUtc
            .Select(s => new WeekOneLessonSlotDto { StartsAtUtc = s, DurationMinutes = durationMinutes })
            .ToList();
        return TryValidateWeekOneLessons(lessons, lessonFrequency, out error);
    }

    public static List<PlannedLessonSlotDto> PlanFromWeekOneSlots(
        IReadOnlyList<DateTime> weekOneStartsUtc,
        string lessonFrequency,
        int durationMinutes)
    {
        var lessons = weekOneStartsUtc
            .Select(s => new WeekOneLessonSlotDto { StartsAtUtc = s, DurationMinutes = durationMinutes })
            .ToList();
        return PlanFromWeekOneLessons(lessons, lessonFrequency);
    }

    public static IEnumerable<DateTime> EnumerateGridStarts(DateTime rangeStartUtc, DateTime rangeEndUtc)
    {
        var day = rangeStartUtc.Date;
        var endDay = rangeEndUtc.Date;
        while (day <= endDay)
        {
            for (var minute = 0; minute < 24 * 60; minute += GridStepMinutes)
            {
                var time = TimeSpan.FromMinutes(minute);
                if (time < DayOpen)
                    continue;
                if (time.Add(TimeSpan.FromMinutes(GridStepMinutes)) > DayClose)
                    break;

                var start = DateTime.SpecifyKind(day.Add(time), DateTimeKind.Utc);
                if (start >= rangeStartUtc && start < rangeEndUtc)
                    yield return start;
            }

            day = day.AddDays(1);
        }
    }

    public static bool MatchesPreferredWindow(DateTime startUtc, string daySlotCode)
    {
        var parts = daySlotCode.Split('-', 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return false;
        if (!TryParseDayOfWeek(parts[0], out var dow) || startUtc.DayOfWeek != dow)
            return false;

        var hour = startUtc.Hour + startUtc.Minute / 60.0;
        return parts[1].ToUpperInvariant() switch
        {
            "MORNING" => hour >= 8 && hour < 12,
            "AFTERNOON" => hour >= 12 && hour < 17,
            "EVENING" => hour >= 17 && hour < 22,
            _ => false,
        };
    }

    public static List<AvailabilitySlotDto> BuildAvailability(
        DateTime fromUtc,
        DateTime toUtc,
        IReadOnlyList<LessonSlot> booked,
        IReadOnlyList<string>? preferredFilter,
        int durationMinutes)
    {
        var pickerMode = durationMinutes <= 0;
        var list = new List<AvailabilitySlotDto>();
        foreach (var start in EnumerateGridStarts(fromUtc, toUtc))
        {
            var matchesPreference = preferredFilter is not { Count: > 0 }
                || preferredFilter.Any(p => MatchesPreferredWindow(start, p));

            var cellEnd = SlotEnd(start, GridStepMinutes);

            var blocking = booked.FirstOrDefault(b =>
                b.StudentUserId is not null && b.StartsAtUtc < cellEnd && b.EndsAtUtc > start);

            if (blocking is not null
                && TryMapOccupiedGridCell(start, cellEnd, blocking, matchesPreference, isAdmin: false, booked, out var studentCell))
            {
                list.Add(studentCell);
                continue;
            }

            var adminEntry = booked.FirstOrDefault(b =>
                b.StudentUserId is null && b.StartsAtUtc < cellEnd && b.EndsAtUtc > start);

            if (adminEntry is not null
                && TryMapOccupiedGridCell(start, cellEnd, adminEntry, matchesPreference, isAdmin: true, booked, out var adminCell))
            {
                list.Add(adminCell);
                continue;
            }

            var availableDurations = GetAvailableDurationsForStart(start, booked);

            if (pickerMode)
            {
                if (availableDurations.Count == 0)
                    continue;

                list.Add(
                    new AvailabilitySlotDto
                    {
                        StartsAtUtc = start,
                        EndsAtUtc = SlotEnd(start, GridStepMinutes),
                        DurationMinutes = GridStepMinutes,
                        AvailableDurationMinutes = availableDurations,
                        IsAvailable = true,
                        MatchesStudentPreference = matchesPreference,
                    });
                continue;
            }

            if (!matchesPreference)
                continue;

            if (availableDurations.Count == 0)
                continue;

            if (!availableDurations.Contains(durationMinutes))
                continue;

            var end = SlotEnd(start, durationMinutes);
            var conflict = booked.FirstOrDefault(b => b.StartsAtUtc < end && b.EndsAtUtc > start);
            var isBooked = conflict?.StudentUserId is not null;

            list.Add(
                new AvailabilitySlotDto
                {
                    StartsAtUtc = start,
                    EndsAtUtc = end,
                    DurationMinutes = durationMinutes,
                    AvailableDurationMinutes = availableDurations,
                    IsAvailable = !isBooked,
                    SlotId = conflict?.Id,
                    StudentUserId = conflict?.StudentUserId,
                    StudentName = conflict?.Student is null
                        ? null
                        : $"{conflict.Student.FirstName} {conflict.Student.LastName}".Trim(),
                    StudentCountry = conflict?.Student?.Onboarding?.Country,
                    StudentCity = conflict?.Student?.Onboarding?.City,
                    StudentLessonNote = conflict?.StudentUserId is not null && conflict is not null
                        ? TrimOrNullNote(conflict.StudentNote)
                        : null,
                    AttendanceStatus = conflict?.StudentUserId is not null && conflict is not null
                        ? AttendanceStatusCodes.ToApiValue(conflict.AttendanceStatus)
                        : null,
                });
        }

        return list;
    }

    /// <summary>Legacy single-anchor planner (infers weekdays from preferences).</summary>
    public static List<DateTime> PlanMonthlyLessonStarts(
        DateTime anchorStartsAtUtc,
        string lessonFrequency,
        IReadOnlyList<string> preferredAvailability)
    {
        anchorStartsAtUtc = DateTime.SpecifyKind(anchorStartsAtUtc, DateTimeKind.Utc);
        var weeklyDays = ResolveWeeklyDays(anchorStartsAtUtc.DayOfWeek, lessonFrequency, preferredAvailability);
        var results = new List<DateTime>();
        var freq = lessonFrequency.Trim().ToUpperInvariant();
        var baseDate = anchorStartsAtUtc.Date;

        for (var week = 0; week < BookingWeeks; week++)
        {
            if (freq == "BIWEEKLY" && week % 2 != 0)
                continue;

            foreach (var dow in weeklyDays)
            {
                var dayOffset = ((int)dow - (int)anchorStartsAtUtc.DayOfWeek + 7) % 7;
                var start = DateTime.SpecifyKind(
                    baseDate.AddDays(week * 7 + dayOffset).Add(anchorStartsAtUtc.TimeOfDay),
                    DateTimeKind.Utc);
                if (start >= anchorStartsAtUtc.AddMinutes(-1))
                    results.Add(start);
            }
        }

        return results.Distinct().OrderBy(d => d).ToList();
    }

    private static List<DayOfWeek> ResolveWeeklyDays(
        DayOfWeek anchorDay,
        string lessonFrequency,
        IReadOnlyList<string> preferredAvailability)
    {
        var fromPrefs = preferredAvailability
            .Select(code =>
            {
                var day = code.Split('-')[0];
                return TryParseDayOfWeek(day, out var d) ? d : (DayOfWeek?)null;
            })
            .Where(d => d.HasValue)
            .Select(d => d!.Value)
            .Distinct()
            .ToList();

        if (!fromPrefs.Contains(anchorDay))
            fromPrefs.Insert(0, anchorDay);
        else
        {
            fromPrefs.Remove(anchorDay);
            fromPrefs.Insert(0, anchorDay);
        }

        return lessonFrequency.Trim().ToUpperInvariant() switch
        {
            "TWICE-WEEK" => fromPrefs.Take(2).ToList(),
            "THREE-WEEK" => fromPrefs.Take(3).ToList(),
            "FOUR-PLUS-WEEK" => fromPrefs.Take(4).ToList(),
            _ => [anchorDay],
        };
    }

    private static bool TryParseDayOfWeek(string code, out DayOfWeek dow) =>
        code.ToUpperInvariant() switch
        {
            "SUN" => Assign(DayOfWeek.Sunday, out dow),
            "MON" => Assign(DayOfWeek.Monday, out dow),
            "TUE" => Assign(DayOfWeek.Tuesday, out dow),
            "WED" => Assign(DayOfWeek.Wednesday, out dow),
            "THU" => Assign(DayOfWeek.Thursday, out dow),
            "FRI" => Assign(DayOfWeek.Friday, out dow),
            "SAT" => Assign(DayOfWeek.Saturday, out dow),
            _ => Assign(default, out dow, false),
        };

    private static bool Assign(DayOfWeek value, out DayOfWeek dow, bool ok = true)
    {
        dow = value;
        return ok;
    }

    private static bool TryMapOccupiedGridCell(
        DateTime gridStart,
        DateTime cellEnd,
        LessonSlot booking,
        bool matchesPreference,
        bool isAdmin,
        IReadOnlyList<LessonSlot> booked,
        out AvailabilitySlotDto cell)
    {
        cell = null!;
        var entryStart = DateTime.SpecifyKind(booking.StartsAtUtc, DateTimeKind.Utc);
        var entryEnd = DateTime.SpecifyKind(booking.EndsAtUtc, DateTimeKind.Utc);
        var durationMinutes = (int)Math.Round((entryEnd - entryStart).TotalMinutes);

        if (entryEnd <= gridStart || entryStart >= cellEnd)
            return false;

        var fullyBlocked = entryStart <= gridStart && entryEnd >= cellEnd;
        if (!fullyBlocked && entryEnd < cellEnd && entryEnd > gridStart)
        {
            var freeStart = entryEnd;
            cell = new AvailabilitySlotDto
            {
                StartsAtUtc = gridStart,
                EndsAtUtc = cellEnd,
                DurationMinutes = GridStepMinutes,
                AvailableDurationMinutes = GetAvailableDurationsForStart(freeStart, booked),
                IsAvailable = true,
                IsPartiallyBlocked = true,
                FreeSegmentStartsAtUtc = freeStart,
                PartialBlockEndsAtUtc = entryEnd,
                EntryStartsAtUtc = entryStart,
                EntryEndsAtUtc = entryEnd,
                MatchesStudentPreference = matchesPreference,
                SlotId = booking.Id,
                IsAdminCalendarEntry = isAdmin,
                Title = isAdmin ? TrimOrNullNote(booking.Title) : null,
                Description = isAdmin ? TrimOrNullNote(booking.Description) : null,
                StudentUserId = isAdmin ? null : booking.StudentUserId,
                StudentName = isAdmin || booking.Student is null
                    ? null
                    : $"{booking.Student.FirstName} {booking.Student.LastName}".Trim(),
                StudentCountry = isAdmin ? null : booking.Student?.Onboarding?.Country,
                StudentCity = isAdmin ? null : booking.Student?.Onboarding?.City,
                StudentLessonNote = isAdmin ? null : TrimOrNullNote(booking.StudentNote),
                AttendanceStatus = isAdmin ? null : AttendanceStatusCodes.ToApiValue(booking.AttendanceStatus),
            };
            return true;
        }

        cell = new AvailabilitySlotDto
        {
            StartsAtUtc = gridStart,
            EndsAtUtc = cellEnd,
            DurationMinutes = durationMinutes,
            AvailableDurationMinutes = [],
            IsAvailable = false,
            MatchesStudentPreference = matchesPreference,
            SlotId = booking.Id,
            EntryStartsAtUtc = entryStart,
            EntryEndsAtUtc = entryEnd,
            IsAdminCalendarEntry = isAdmin,
            Title = isAdmin ? TrimOrNullNote(booking.Title) : null,
            Description = isAdmin ? TrimOrNullNote(booking.Description) : null,
            StudentUserId = isAdmin ? null : booking.StudentUserId,
            StudentName = isAdmin || booking.Student is null
                ? null
                : $"{booking.Student.FirstName} {booking.Student.LastName}".Trim(),
            StudentCountry = isAdmin ? null : booking.Student?.Onboarding?.Country,
            StudentCity = isAdmin ? null : booking.Student?.Onboarding?.City,
            StudentLessonNote = isAdmin ? null : TrimOrNullNote(booking.StudentNote),
            AttendanceStatus = isAdmin ? null : AttendanceStatusCodes.ToApiValue(booking.AttendanceStatus),
        };
        return true;
    }

    private static string? TrimOrNullNote(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
