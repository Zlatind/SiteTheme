# BlockCraft Pocket

A Minecraft-style voxel sandbox game built for phones. It runs in the browser
and installs to the home screen as a full-screen app that works offline (PWA).

The menus and HUD follow the layout of the mobile ("Pocket") edition of
Minecraft: title screen with a moving world in the background, the Play
screen with world list and *Create New*, the create-world form,
Settings, D-pad / joystick touch controls, jump button, hotbar with the
`•••` inventory button, hearts, hunger and XP bar, the creative and survival
inventories, the pause menu and the death screen.
All textures, sounds, the logo and the name are original and generated in
code. This is a fan project, not affiliated with Mojang or Microsoft.

## Features

- Infinite procedurally generated terrain: hills, mountains, oceans, beaches,
  deserts with cacti, snowy biomes, forests, caves and ores
- Flat world option
- Survival (health, hunger, fall damage, crafting, XP) and Creative (flying,
  instant breaking, every block)
- 30+ block types, TNT that explodes and chains
- Day/night cycle with sun, moon, stars and drifting clouds
- Smooth lighting (ambient occlusion), translucent water, swimming
- Auto-saving worlds with thumbnails, plus export/import as JSON
- Chat commands: `/help`, `/time set`, `/gamemode`, `/tp`, `/give`, `/seed`,
  `/spawnpoint`, `/kill`, `/clear`

## Controls

| Touch | Keyboard / mouse |
| --- | --- |
| D-pad or joystick: move (double-tap forward to sprint) | WASD, Ctrl to sprint |
| Drag on the screen: look | Mouse |
| Hold: break a block | Left click |
| Tap: place a block, eat, light TNT | Right click |
| Jump button (double-tap in Creative to fly) | Space |
| Middle of the D-pad: sneak | Shift |
| `•••` on the hotbar: inventory | E |
| Chat button | T or / |

## Running it

No build step. Serve the folder with any static web server:

```sh
python3 -m http.server 8000
```

Then open `http://<your-computer-ip>:8000` on your phone. To install it, use
**Add to Home Screen** in Safari (iOS) or **Install app** in Chrome (Android).
Service workers need HTTPS (or localhost), so for offline play host it on
GitHub Pages, Netlify or similar.

## Project layout

```
index.html            all screens and the HUD
css/style.css         Minecraft-style UI (buttons, panels, hotbar, controls)
js/textures.js        procedural 16×16 pixel-art texture atlas
js/blocks.js          block / item registry, creative tabs and recipes
js/world.js           noise, terrain generation, chunk meshing, ray casting
js/icons.js           inventory icons, hearts/hunger, title logo
js/audio.js           synthesized sound effects
js/game.js            renderer, player physics, controls, survival rules
js/ui.js              menus, inventory, settings, chat commands
sw.js                 offline cache
vendor/three.min.js   three.js r150 (MIT)
```
