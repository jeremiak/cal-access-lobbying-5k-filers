// deno-lint-ignore-file no-explicit-any

import _ from "npm:lodash@4.17";
import Queue from "npm:p-queue@latest"
import { csvParse, csvFormat } from 'npm:d3-dsv@latest'
import { parse } from "https://deno.land/std@0.182.0/flags/mod.ts";
import {
  DOMParser,
  // deno-lint-ignore no-unused-vars
  Element,
  HTMLDocument,
} from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

interface FiveKFiler {
  session: string | undefined;
  name: string | undefined;
  fppcId: string | undefined;
}

async function scrapeFilersForQueryAndSession(query: string, session: string): Promise<FiveKFiler[]> {
  const url = `https://cal-access.sos.ca.gov/Lobbying/Payments/list.aspx?letter=${query}&session=${session}`;
  const response = await fetch(url);
  const status: number = response.status;
  const html = await response.text();
  const doc: HTMLDocument | null = new DOMParser().parseFromString(
    html,
    "text/html",
  );

  if (status !== 200) throw new Error(`Error with ${url} - ${status}`);

  const rows = doc?.querySelector('#_ctl3_payments')?.querySelectorAll('tbody tr') || []
  const filers: FiveKFiler[] = []
  
  rows.forEach((node, i) => {
    if (i === 0) return

    const cells = node.querySelectorAll('td')

    const filer = {
      session: `${session}`,
      name: cells[0].innerText,
      fppcId: cells[1].innerText
    }


    filers.push(filer)
  })

  console.log(
    `Found ${filers.length} $5K filers that start with ${query} in ${session}`,
  );

  return filers;
}

const args = parse(Deno.args)
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0'.split('')
const queue = new Queue({ concurrency: 4 })
const scraped: FiveKFiler[] = []
const session = args.session || '2023'

console.log(`Scraping $5K filers for the ${session}-${+session + 1} session`)

letters.forEach((query: string) => {
  queue.add(async () => {
    const filers: FiveKFiler[] = await scrapeFilersForQueryAndSession(query, session);
    scraped.push(...filers)
  })
})

await queue.onIdle();

console.log(`Saving to ${scraped.length} filers to a file`);
const filePath = `./5k-filers.csv`
const existingFile = await Deno.readTextFile(filePath)
const existing = csvParse(existingFile)
const withoutSession = existing.filter((d: FiveKFiler) => d.session !== `${session}`)
const combined = [...withoutSession, ...scraped]
const sorted = _.orderBy(combined, ["session", "name", "fppcId"], ["desc", "asc", "asc"]);
const text = csvFormat(sorted)
await Deno.writeTextFile(filePath, text);
console.log(`All done`);
