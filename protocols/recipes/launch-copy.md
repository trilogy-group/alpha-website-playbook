# Recipe: "still shows launch copy but is already open"

Class `observer-launch-copy`. Scope is media and copy. Both must be true before the ticket closes.

1. Confirm the campus state is Open in `spec/campus-lifecycle.json` (map programType). If it is Announced, the ticket is wrong; send it back naming the state.
2. Copy: the intro text-editor widget in the Center section reads "Alpha <Campus> is open and enrolling." followed by the info-session paragraph. Replace the launch sentence only, keep the campus name as written. Exemplars: Plano, Scottsdale.
3. Media: the intro card slot shows the campus's approved open-state media from `registry/campus-open-media.json`. If the registry has no asset, Missing Info naming Yash Chitneni and the exact card needed. Never substitute another campus's image or unrelated footage.
4. Also check the hero and the rest of the page for launch-era words or images (Coming Soon, Coming Fall, Launching, Opening).
5. Tests: ring 1 (sentence), ring 2 (whole page with screenshots of header and intro), ring 3 (two untouched pages after cache clear). Then request an observer rerun and confirm the SITE id clears.
