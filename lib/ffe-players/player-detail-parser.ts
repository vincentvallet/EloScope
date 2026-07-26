import { load } from "cheerio";
import { normalizeFideId } from "@/lib/fide/identity/normalize-fide-id";

export function parsePlayerDetail(html: string) {
  const $ = load(html);
  const fideHref = $("a[href*='ratings.fide.com/profile/']").attr("href");
  return {
    fideId: fideHref?.match(/profile\/(\d+)/)?.[1]
      ? normalizeFideId(fideHref.match(/profile\/(\d+)/)![1])
      : undefined,
    title: $("#ctl00_ContentPlaceHolderMain_LabelTitreFide").text().trim() || undefined,
  };
}
