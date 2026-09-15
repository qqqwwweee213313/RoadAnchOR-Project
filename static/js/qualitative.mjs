const mediaPath = /^\.\/static\/videos\/scenarios\/scenario-[a-f0-9]{12}\/(?:clip|poster)-[a-f0-9]{16}\.(?:mp4|webm|jpg|jpeg|png|webp)$/;
export function validateCatalog(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.scenarios)) throw new Error('Invalid video catalog.');
  const ids = new Set();
  for (const scenario of data.scenarios) {
    if (!scenario || !/^scenario-[a-f0-9]{12}$/.test(scenario.id) || ids.has(scenario.id)
      || typeof scenario.title !== 'string' || typeof scenario.description !== 'string'
      || !Array.isArray(scenario.clips) || !scenario.clips.length) throw new Error('Invalid scenario.');
    ids.add(scenario.id);
    for (const clip of scenario.clips) {
      if (!clip || typeof clip.title !== 'string' || typeof clip.caption !== 'string'
        || !mediaPath.test(clip.src) || !/\.(mp4|webm)$/.test(clip.src)
        || !['video/mp4', 'video/webm'].includes(clip.type)
        || (clip.src.endsWith('.mp4') ? clip.type !== 'video/mp4' : clip.type !== 'video/webm')
        || (clip.poster !== undefined && (!mediaPath.test(clip.poster) || !/\.(jpg|jpeg|png|webp)$/.test(clip.poster)))) {
        throw new Error('Invalid video.');
      }
    }
  }
  return data.scenarios;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function mediaURL(relative) {
  // Resolve against the page, so both root and /RoadAnchOR/ hosting work.
  return new URL(relative, document.baseURI).href;
}
function makeClip(clip, scenario) {
  const card = element('figure', 'video-card');
  const heading = element('h4', 'video-title', clip.title);
  const video = element('video', 'scenario-video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.muted = true;
  video.setAttribute('aria-label', scenario.title + ': ' + clip.title);
  if (clip.poster) video.poster = mediaURL(clip.poster);
  const source = element('source');
  source.src = mediaURL(clip.src);
  source.type = clip.type;
  video.append(source, document.createTextNode('Your browser does not support embedded video.'));
  const caption = element('figcaption', 'video-caption');
  if (clip.caption) caption.append(element('p', '', clip.caption));
  const link = element('a', 'video-open', 'Open video');
  link.href = mediaURL(clip.src);
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', 'Open video: ' + scenario.title + ', ' + clip.title);
  caption.append(link);
  const error = element('p', 'video-error', 'This video could not be played. Try the Open video link.');
  error.hidden = true;
  error.setAttribute('role', 'status');
  video.addEventListener('error', () => { error.hidden = false; });
  source.addEventListener('error', () => { error.hidden = false; });
  video.addEventListener('play', () => {
    document.querySelectorAll('.scenario-video').forEach(other => { if (other !== video) other.pause(); });
  });
  card.append(heading, video, error, caption);
  return card;
}
export async function initializeVideos() {
  const list = document.getElementById('scenario-list');
  if (!list) return;
  try {
    const response = await fetch(new URL('../data/scenarios.json', import.meta.url));
    if (!response.ok) throw new Error('Video catalog request failed.');
    const scenarios = validateCatalog(await response.json());
    if (!scenarios.length) return;
    const sections = scenarios.map(scenario => {
      const section = element('section', 'scenario');
      section.id = scenario.id;
      section.setAttribute('aria-labelledby', scenario.id + '-title');
      const heading = element('h3', 'scenario-title', scenario.title);
      heading.id = scenario.id + '-title';
      const grid = element('div', 'video-grid');
      grid.append(...scenario.clips.map(clip => makeClip(clip, scenario)));
      section.append(heading);
      if (scenario.description) section.append(element('p', 'scenario-description', scenario.description));
      section.append(grid);
      return section;
    });
    list.replaceChildren(...sections);
  } catch {
    list.replaceChildren(element('p', 'videos-empty', 'Videos could not be loaded. Please refresh this page to try again.'));
  }
}
if (typeof document !== 'undefined') initializeVideos();
