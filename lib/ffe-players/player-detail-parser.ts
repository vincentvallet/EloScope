import { load } from "cheerio";

export function parsePlayerDetail(html: string) {
  const $ = load(html);
  const fideHref = $("a[href*='ratings.fide.com/profile/']").attr("href");
  return {
    fideId: fideHref?.match(/profile\/(\d+)/)?.[1],
    title: $("#ctl00_ContentPlaceHolderMain_LabelTitreFide").text().trim() || undefined,
  };
}
