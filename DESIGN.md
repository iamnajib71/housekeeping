# Housekeeping interface

## Direction

A calm shared-home workspace. The primary screen begins with the person's
cleaning duty, followed by a compact household summary and weekly roster.
The interface must feel useful during a busy evening, rather than promotional.
This develops the compact Today / cleaning / meals direction accepted in chat.

## Tokens

- Ink: `#183b3a`; body text and headings.
- Teal: `#08756b`; primary actions and selected controls.
- Deep teal: `#103d3b`; desktop navigation and sign-in story surface.
- Cloud: `#f3f7f6`; application canvas.
- White: `#ffffff`; working surfaces.
- Muted: `#526c69`; secondary text on light surfaces.

Semantic success, warning, error and council bin colors remain distinct and
always accompany text. Dividers use a light desaturated teal.

## Type and components

DM Sans throughout, using a compact rem scale. Headlines are sentence case;
no decorative eyebrows or numbered cleaning areas. Buttons have a consistent
44px minimum target and visible keyboard focus. Main working surfaces use
14px corners, thin borders and no decorative shadows.

## Layout

Desktop: fixed deep-teal navigation; compact property toolbar; left-aligned
content. Put the person's cleaning task before metrics. Use the roster as
compact day columns and the deep-clean plan as one exact duty list per person, shared with the task preview.

Mobile: Today, Schedule, Meals and More in a fixed bottom bar, with safe-area
padding. More opens a keyboard-contained navigation drawer. Weekly dates
become readable rows instead of tall two-column tiles. Full checklists and
proof keep their focused task dialog.

Meals: daily rice, existing food and next cook share the first working area;
shopping follows. Contribution history and group configuration use disclosure
controls. Empty states explain the next step without invented sample activity.

## Review before implementation

The previous equal-weight statistics and large calendar tiles delayed the main
action. The replacement changes hierarchy and density, not just colors. A
decorative illustration would add little to this task-oriented product, so
the visual emphasis belongs to ownership, working controls and status.

## Motion and verification

Use short transitions for drawer, button and checkbox state changes. Avoid
autoplay task pulses or repeated entrance animations. Respect reduced motion.
Verify desktop and phone layouts, keyboard navigation, text contrast, long
content, personal submission states, future Monday plans and meal workflows.

## Design tooling

Guidance: [Impeccable](https://github.com/pbakaus/impeccable), using its
Operate-mode, craft-floor and responsive principles. A project-local copy is
kept in ignored .local/design-skills for this session. The Windows context
engine was unavailable; product context was read directly from the existing
code and confirmed conversation. No design service ships in the application.

## Remembered dark mode

The theme toggle appears on all routes. The device preference is stored in
localStorage under housekeeping-theme and applied in the document head before
paint. Without an explicit preference, follow the operating system. Never
cache household responses or proof as part of theme persistence. Dark mode uses
forest surfaces and light mint actions with dark text, preserving semantic
status colors, readable form controls and a white QR-code background.

## Monday ownership consistency

The dashboard summary and future-assignment preview use the same WeeklyDuties
component and weeklyTaskPlan result. Display exact duties under each person,
including the full description. A shared room label must never imply both
people own its whole checklist. Explain split rooms explicitly.
