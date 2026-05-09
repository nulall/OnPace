# OnPace
OnPace is a mobile-first running training plan app based on Jack Daniels' VDOT methodology. Enter your VDOT score, race date, and distance to generate a structured training plan with personalized Easy, Tempo, Interval, and Long run paces. Export workouts to calendar (.ics) or Garmin via importmyworkout.com.

## Using the app

OnPace has four tabs:

- **Dashboard** — your at-a-glance summary: next run, goal time, race pace, training paces, and plan progress.
- **Plan** — week-by-week training schedule. Tap a week number to jump to it. Today's run is highlighted.
- **Export** — select individual workouts and export to `.ics` (Apple/Google Calendar) or send to [importmyworkout.com](https://importmyworkout.com) for Garmin.
- **Settings** — configure your plan and export preferences. Tap **Apply changes** to regenerate the plan.

## Sharing and saving your plan

Your settings are not stored server-side. Instead, tap **Copy plan URL** in Settings to get a link with your full configuration encoded as readable URL parameters. Bookmark it or share it — opening the link restores your exact plan. The bare URL (no parameters) always loads the default settings.

## Settings reference

### Plan

| Setting | Default | Description |
|---|---|---|
| **VDOT score** | 30 | Your current fitness level (30–55). Use the linked calculator to find yours from a recent race time. Lower = slower; higher = faster. |
| **Race date** | 8 weeks from today | Target race day. The plan length is calculated from the start date to this date. |
| **Race distance** | 10K | 5K, 8K, 10K, 15K, half marathon, marathon, or custom (enter miles). |
| **Plan start date** | Today | First day of your training block. |
| **Starting long run** | 5 mi | Distance of your long run in week 1. The plan builds progressively from here to a peak, then tapers. |
| **Days per week** | 4 | 3–6 days. Determines how many easy, tempo, and interval runs fill the week. |
| **Long run day** | Saturday | Day of the week for your long run. |
| **Taper weeks** | 2 | 1 or 2 weeks of reduced volume before race day. |
| **Units** | Miles | Miles or kilometers. |
| **Plan name** | *(blank)* | Optional label shown in the header, browser tab title, and used as the calendar file name. |

### Export options

| Setting | Default | Description |
|---|---|---|
| **Workout start time** | 6:00 AM | Time of day used for calendar events. |
| **Out-and-back split** | Off | Splits easy/long distance in half and tempo main segment in half — useful when you need to turn around at the midpoint. |
| **Warmup / cooldown** | Time (10:00) | *Distance*: exports as 1 mi at easy pace. *Time*: exports as a fixed 10-minute block. |
| **Pre-quality strides** | Off | Adds 4 × 25s strides at stride pace after warmup, before tempo and interval efforts. |
| **Striders after easy runs** | Off | Adds 4 × 30s accelerations at stride pace to the end of easy runs to build running economy. |

### Workout options

| Setting | Default | Description |
|---|---|---|
| **Interval reps** | 4 | Number of repetitions in interval workouts (2–8). |

## Technical notes

OnPace is a single HTML file with no build step or server-side logic. It uses [React](https://react.dev) for UI state management — instead of manually wiring up DOM updates, React re-renders only the parts of the page that depend on changed data. The [`htm`](https://github.com/developit/htm) library provides JSX-like syntax via tagged template literals, so the app runs directly in the browser without a compiler.
