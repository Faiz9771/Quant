import {
  computeSectorBreakdown,
  writeBreakdownCache,
} from "../src/lib/data/fii-holdings";

async function main() {
  const perSectorRaw = process.env.PER_SECTOR;
  const perSector = perSectorRaw ? Number(perSectorRaw) : Infinity;
  const delayMs = Number(process.env.DELAY_MS ?? "1500");
  console.log(
    `Refreshing FII/DII sector breakdown · ${
      Number.isFinite(perSector) ? perSector : "all"
    } stocks/sector · ${delayMs}ms throttle`
  );
  const data = await computeSectorBreakdown(perSector, delayMs);
  await writeBreakdownCache(data);
  const ok = data.sectors.filter((s) => s.sampleSize > 0).length;
  console.log(`Wrote data/fii-dii-sectors.json · ${ok}/${data.sectors.length} sectors with data`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
