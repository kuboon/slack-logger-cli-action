import main from "./main.ts";
import settings from "./settings.ts";
import * as core from "@actions/core";

const timeZone = settings.tz;
console.log(`Timezone: ${timeZone}`);
const year = parseInt(settings.year || "");
const month = parseInt(settings.month || "");
let from;
if (isNaN(year)) {
  if (!isNaN(month)) {
    core.setFailed("should specify both year and month");
    Deno.exit(1);
  }
  const now = Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate()
    .toPlainYearMonth();
  const twoMonths = Temporal.Duration.from({ months: 2 });
  from = now.subtract(twoMonths).toPlainDate({ day: 1 }).toZonedDateTime(
    timeZone,
  );
} else {
  const ym = Temporal.PlainDateTime.from({
    year,
    month,
    day: 1,
  });
  from = ym.toZonedDateTime(timeZone);
}
core.notice(`start backing up ${from.year}/${from.month}`);
const to = from.add({ months: 1 });

main(new Date(from.epochMilliseconds), new Date(to.epochMilliseconds))
  .catch((e) => {
    console.error(e);
    core.setFailed(`Action failed with error ${e}`);
  });
