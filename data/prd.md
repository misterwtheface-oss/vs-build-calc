---
name: vs-build-calculator
descrtiption: Design specifications
---

# Overview of Layout

- **Landing Page**
    This is where the user is prompted to select the number of players they're planning for (e.g. single or up to 4-player multiplayer); this influences the number of weapon and passive slots each character is limited to by default. This should also produce 4 different layouts that seamlessly accommodate the player count
- **Planning Page**
    This page should use the empty.png icons as placeholders and include a single tile for each player with the default number of slots for passives and weapons pre-rendered. There should always 3 arcana slots and 1 stage slots. Clicking on a box opens its corresponding selection window rendered as an overlay. 
- **Character Selection**
    This is a scrollable list of all possible characters, those with variants render as stacked cards amd can be cycled through. Character stats rendered in a planel and changes displayed on selection. Small blurb about the character's unstated passives and their character identity.
- **Item Selection**
    This is where weapons and passives are selected. Weapons are showns in collection order (i.e. the "Collection" menu screen layout of all collectable items). Weapons are highlighted if they have an association to the selected character or arcana. Clicking on an item shows its base stats, level up bonuses, max stats, next stage transformation, requirements to transform, final form, a blurb about the weapon identity, and association to other items through shared identity traits. 
- **Arcana Selection**
    This is where Arcana are selected. Arcana are shown in number order Arcana and Darkana sharing a number rendering as a stack of two cards that can be cycled through. Arcana are highlighted if they have an association to the selected character or weapons. Clicking on an Arcana shows a blurb about the arcana identity, relation to other arcana, and icons of weapons listed on the Arcana as affected weapons.
- **Stage Selection**
    This is where the stage is selected. This primarily drives rendering on the main planning page to show selections that are already present as stage items. 

## Landing Page
Basic landing page that navigates to the main section of the page based on player count. 

### Landing Page Requirements
- Four tiles, 2x2 rounded squares. Player count icons displayed on tile. 
- Page banner: 'Vampire Survivors Build Calculator'
- Navigate to Planning Page when a selection is made

### Landing Page Test Cases

- User arrival
> GIVEN Arriving on the landing page
> WHEN Tiles are rendered
> THEN 4 tiles are displayed: 1 Player, 2 Player, 3 Player, and 4 Player 

- Navigation case
> GIVEN On the Landing Page
> WHEN User selects a tile
> THEN User is navigated to the Planning Page layout for the selected player count

## Planning Page
This page is dynamic based on selections and shows context blurbs for different window selections (e.g. not directly on an icon). 

### Planning Page Requirements
- One row for each player character consisting of one Character tile, and weapon and passive slots matching player count (1 Player = 6,2 Player = 4,3 Player = 3,4 Player = 2)
- Empty.png is used for each of the tiles until a selection is made, empty.png is then replaced with the corresponding selection's icon
- When passives and an unevolved weapon are selected together, the weapon automatically updates both visually and it's identity internally switches to the next stage it moved to. 
- When weapons are hidden they are rendered to the right of weapon and passive slots with lower alpha and are still selectable to see info about them but cannot be removed
- 3 Slots for Arcana
- 1 Slot for Stage
- Button for "Change Player Count", navigates back to Landing Page
- Returning to the same player count loses nothing, going to a lesser count drops the lowest player tile in order (e.g. Going from 2-Player to 1-Player loses Player #2 and retains #1)
- Selecting a tile opens a selection window for that category rendered as a partial screen cover overlay 
- There should be a "clear all selections" capability for a given player that does not remove selections of another player
- Clicking on a player tile (**not** Character tile), a panel is rendered with info about the character identity and any character-specific info about selected weapons and arcana

## Character Selection 
When clicking on the character icon (empty or selected) should bring up the character selection window. There should be a scrollable list of rows with the character icons rendered. Characters with multiple variants of their base should appear like a slightly offset stack of cards that be cycled through. There should be a side panel to the left with all of the character stats and on selection it should update from the base, unaltered values to the base values of the selected character (e.g. character start values added to base values). There should be a confirm button to select the character and exit the window, hitting escape should behave in two ways conditionally - if no character previously selected **and** a character is selected in this window

### Character Selection Requirements
- Rendered as an overlay covering 75% of the screen and is centered
- Character tiles are rendered using their corresponding icons in rows
- A panel with base stats is on the left side of the window
- Selecting a tile highlights it and shows the affect on base stats in the left panel and opens a right-side panel with a blurb about their class identity and passives
- There should be a "Confirm" button to confirm the character selection and return to the planning page
- Hitting escape should close the window with different results conditionally; when entering the window from an "empty" character then exiting with a character highlighted operates the same as if "Confirm" was selected, when entering from a selected character, there is no change to the selected character. 

### Character Selection Test Cases
- Enter from 'Empty', exit with 'Escape'
> GIVEN User entered the character selection screen from an 'Empty' character tile
> AND User has a character selected in the current window
> WHEN User enters the 'Esc' command on their keyboard
> THEN User is returned to the Planning page with the character selected in the window

- Enter from populated Character Tile, exit with 'Escape'
> GIVEN User entered the character selection screen from populated character tile
> AND User has a character selected in the current window
> WHEN User enters the 'Esc' command on their keyboard
> THEN User is returned to the Planning page with no change to the character stored on the Planning page

## Item Selection
- Rendered as an overlay covering 75% of the screen and is centered
- Item (e.g. Passive and Weapon) tiles are rendered using their corresponding icons in rows; passives lead at the top of the window
- Icons show associations from the selected character, arcana, or other selected items (both in and outside this specific window) with visual indicators corresponding to the source and identity of the association
- Selecting a tile highlights it and shows its base stats and level-ups in a panel on the left side of the window
- Selecting a tile highlights it and shows its evolution path and a blurb about its identity in a panel on the right side of the window
- There should be a "Confirm" button to confirm the item selection and return to the planning page
- Hitting escape should close the window with different results conditionally; when entering the window from an "empty" item then exiting with a item highlighted operates the same as if "Confirm" was selected, when entering from a selected item, there is no change to the selected item. 

## Arcana Selection
- Rendered as an overlay covering 75% of the screen and is centered
- Arcana are rendered using their corresponding icons in rows and in numeric order
- Arcana with a Darkana sharing their number are shown as stacked cards that can be cycled through
- Icons show associations from the selected character, items, or other selected arcana (both in and outside this specific window) with visual indicators corresponding to the source and identity of the association
- Selecting a tile highlights it and shows a blurb about its identity in a panel on the right side of the window
- There should be a "Confirm" button to confirm the arcana selection and return to the planning page
- Hitting escape should close the window with different results conditionally; when entering the window from an "empty" arcana then exiting with a arcana highlighted operates the same as if "Confirm" was selected, when entering from a selected arcana, there is no change to the selected arcana. 

## Stage Selection
- Rendered as an overlay covering 75% of the screen and is centered
- Stages are rendered using their corresponding icons in rows 
- Clicking on a Stage highlights it and opens an info panel on the right side with Icons of stage items