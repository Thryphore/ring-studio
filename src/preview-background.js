// A shared studio-paper backdrop keeps the live preview and PNG exports alike.
// Its broad curves and fine grain are independent of the ring and its lighting.
const backdrops = new Map();

function backdrop(mode) {
  const key = mode === "noir" ? "noir" : "studio";
  if (backdrops.has(key)) return backdrops.get(key);
  const noir = key === "noir";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
  gradient.addColorStop(0, noir ? "#3b4b3c" : "#fbf7eb");
  gradient.addColorStop(0.48, noir ? "#23382b" : "#e8e1ce");
  gradient.addColorStop(1, noir ? "#101f18" : "#d4dfcf");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 1024);

  const light = ctx.createRadialGradient(350, 210, 20, 350, 210, 800);
  light.addColorStop(0, noir ? "#81907438" : "#fffef8e0");
  light.addColorStop(1, "#ffffff00");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 1024, 1024);

  // Soft overlapping sweeps suggest a curved paper studio backdrop.
  ctx.beginPath();
  ctx.moveTo(-100, 850);
  ctx.bezierCurveTo(80, 200, 780, 540, 1120, 60);
  ctx.lineTo(1120, -100);
  ctx.lineTo(-100, -100);
  ctx.closePath();
  const sweep = ctx.createLinearGradient(0, 40, 820, 850);
  sweep.addColorStop(0, noir ? "#c1cdb41c" : "#ffffff65");
  sweep.addColorStop(1, noir ? "#adc6a605" : "#fffcf408");
  ctx.fillStyle = sweep;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-100, 850);
  ctx.bezierCurveTo(80, 200, 780, 540, 1120, 60);
  ctx.strokeStyle = noir ? "#c6d6be16" : "#fffef375";
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-100, 1080);
  ctx.bezierCurveTo(300, 520, 750, 1010, 1120, 500);
  ctx.lineTo(1120, 1120);
  ctx.closePath();
  const lower = ctx.createLinearGradient(0, 500, 1024, 1120);
  lower.addColorStop(0, noir ? "#0b171e00" : "#bccdad00");
  lower.addColorStop(1, noir ? "#07191466" : "#b6c8aa55");
  ctx.fillStyle = lower;
  ctx.fill();

  // Seeded grain stays still when the ring turns or an image is downloaded.
  const pixels = ctx.getImageData(0, 0, 1024, 1024);
  let seed = 14723;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = ((seed >>> 24) / 255 - 0.5) * (noir ? 3 : 4);
    for (let channel = 0; channel < 3; channel++)
      pixels.data[i + channel] += grain;
  }
  ctx.putImageData(pixels, 0, 0);
  const result = { canvas, url: canvas.toDataURL("image/png") };
  backdrops.set(key, result);
  return result;
}

export function backdropImage(mode) {
  return backdrop(mode).url;
}

export function paintBackdrop(ctx, width, height, mode) {
  ctx.drawImage(backdrop(mode).canvas, 0, 0, width, height);
}
