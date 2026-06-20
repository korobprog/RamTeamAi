// Donation wallet values are release-protected. See .github/CODEOWNERS and .github/workflows/protect-donation-wallets.yml.
export type DonationMethod = {
  id: string;
  title: string;
  subtitle: string;
  value: string;
  displayValue?: string;
};

export const donationMethods: DonationMethod[] = [
  {
    id: "alfa-card",
    title: "Карта Альфа-Банк",
    subtitle: "На развитие программы и облачный хостинг",
    value: "2200153696450346",
    displayValue: "2200 1536 9645 0346",
  },
  {
    id: "usdt-trc20",
    title: "USDT TRC20",
    subtitle: "TRON",
    value: "TEpXDuC7CmzpHmip9ppqHMreT4Z1R6Tp4D",
  },
  {
    id: "usdt-ton",
    title: "USDT TON",
    subtitle: "The Open Network",
    value: "UQB_wLx_GKd1Kkvgv4o-mRqngu2_S7bWFRQXNzEVRELFc2AV",
  },
  {
    id: "usdt-bsc",
    title: "USDT BSC",
    subtitle: "BNB Smart Chain (BEP20)",
    value: "0x514691B807C30181a145BE2202431B28418A6Ba8",
  },
];
