import { describe, expect, it } from "vitest";
import { NEUROGATE_INVITE_URL, NEUROGATE_PROVIDER_ID, NEUROGATE_PROMO_CREDIT } from "../../config/neurogateReferral";
import { providersSeed } from "../seed";

describe("Neurogate provider defaults", () => {
  it("keeps Neurogate first in the provider list", () => {
    expect(providersSeed[0]?.id).toBe(NEUROGATE_PROVIDER_ID);
    expect(providersSeed[0]?.name).toBe("Neurogate");
  });

  it("keeps the protected Neurogate referral offer unchanged", () => {
    expect(NEUROGATE_INVITE_URL).toBe("https://portal.neurogate.space/invite?ref=Rerl3hyx81kZ3IRE");
    expect(NEUROGATE_PROMO_CREDIT).toBe("$5");
  });
});
