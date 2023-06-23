import _ from "npm:lodash@4.17";
import Queue from "npm:p-queue@latest";
import { parse } from "https://deno.land/std@0.182.0/flags/mod.ts";
import {
  DOMParser,
  Element,
  HTMLDocument,
} from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

interface FiveKFiler {
  id: string | undefined;
  name: string | undefined;
  quarters: Quarter[];
}

interface Quarter {
  quarter: string | undefined;
  session: string | undefined;
  paymentsToInfluence: number | undefined;
  pucLobbying: number | undefined;
  lobbiedOn: string | undefined;
}

async function scrapeFilersForQueryAndSession(
  query: string,
  session: string,
): Promise<FiveKFiler[]> {
  const url =
    `https://cal-access.sos.ca.gov/Lobbying/Payments/list.aspx?letter=${query}&session=${session}`;
  const response = await fetch(url);
  const status: number = response.status;
  const html = await response.text();
  const doc: HTMLDocument | null = new DOMParser().parseFromString(
    html,
    "text/html",
  );

  if (status !== 200) throw new Error(`Error with ${url} - ${status}`);

  const rows =
    doc?.querySelector("#_ctl3_payments")?.querySelectorAll("tbody tr") || [];
  const filers: FiveKFiler[] = [];

  rows.forEach((n, i) => {
    const node = n as Element;
    if (i === 0) return;

    const cells = node.querySelectorAll("td");
    const firstCell = cells[0] as Element;
    const secondCell = cells[1] as Element;

    const filer = {
      name: firstCell.innerText,
      id: secondCell.innerText,
      quarters: []
    };

    filers.push(filer);
  });

  console.log(
    `Found ${filers.length} $5K filers that start with ${query} in ${session}`,
  );

  return filers;
}

async function scrapeFiveKFilerFinancialActivity(id: string, session: string): Promise<Quarter> {
  console.log(`Scraping financial history for ${id}`)
  const url = `https://cal-access.sos.ca.gov/Lobbying/Payments/Detail.aspx?id=${id}&view=activity&session=${session}`
  const response = await fetch(url)
  const html = await response.text()
  const document: HTMLDocument | null = new DOMParser().parseFromString(
    html,
    "text/html",
  );

  const tbodies = document?.querySelectorAll('tbody')
  const payments = tbodies[6]
  const lobbied = tbodies.length === 8 ? null : tbodies[7]
  // sometimes the table is missing, like in 
  // https://cal-access.sos.ca.gov/Lobbying/Payments/Detail.aspx?id=1418603&session=2023&view=activity

  if (!lobbied) {
    console.log(`No lobbying activity for ${id}`)
    return []
  }

  const paymentRows = payments.querySelectorAll('tr')
  const lobbiedRows = lobbied.querySelectorAll('tr')

  const quarters: Quarter[] = []

  for (let i = 2; i < paymentRows.length; i++) {
      const paymentCells = paymentRows[i].querySelectorAll('td')
      const quarter = paymentCells[1].innerText.trim()
      const session = paymentCells[0].innerText.trim()
      const paymentsToInfluence = +paymentCells[2].innerText.replaceAll(',', '').replace('$', '')
      const pucLobbying = +paymentCells[3].innerText.replaceAll(',', '').replace('$', '')
      const lobbyingMatch = [...lobbiedRows].slice(2).find(row => {
        const cells = row.querySelectorAll('td')
        const s = cells[0].innerText
        const q = cells[1].innerText

        const sessionMatches = s.includes(session)
        const quarterMatches = q === quarter

        return sessionMatches && quarterMatches
      })

      const lobbiedOn = lobbyingMatch ? lobbyingMatch.querySelectorAll('td')[2].innerText : ''

      quarters.push({
        quarter,
        session,
        paymentsToInfluence,
        pucLobbying,
        lobbiedOn,
      })
  }

  return quarters
}

const args = parse(Deno.args);
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0".split("");
const filerQueue = new Queue({ concurrency: 4 });
const activityQueue = new Queue({ concurrency: 4 });
const scraped: FiveKFiler[] = [];
const session = args.session || "2021";

console.log(`Scraping $5K filers for the ${session}-${+session + 1} session`);

letters.forEach((query: string) => {
  filerQueue.add(async () => {
    const filers: FiveKFiler[] = await scrapeFilersForQueryAndSession(
      query,
      session,
    );
    scraped.push(...filers);
  });
});

await filerQueue.onIdle();

console.log(`Getting financial activity for each filer this session`)
scraped.forEach(filer => {
  activityQueue.add(async () => {
    const quarters: Quarter[] = await scrapeFiveKFilerFinancialActivity(filer.id, session)
    filer.quarters = quarters
  })
})

await activityQueue.onIdle();

console.log(`Saving to ${scraped.length} filers to a file`);
const filePath = `./5k-filers-financial-activity-${session}.csv`;
const sorted = _.orderBy(scraped, ["name"]);
await Deno.writeTextFile(filePath, JSON.stringify(sorted, null, 2));
console.log(`All done`);