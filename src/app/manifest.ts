import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daily Mentor Agent",
    short_name: "Daily Mentor",
    description:
      "3日坊主を防ぐ、責めないAIメンター。毎日の最低ラインから一緒に積み上げます。",
    start_url: "/today",
    display: "standalone",
    background_color: "#fafaf8",
    theme_color: "#2f9e77",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
