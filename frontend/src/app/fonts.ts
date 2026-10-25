import { Archivo, IBM_Plex_Mono } from "next/font/google";

// Brandbook section 05: Archivo for titles and text, IBM Plex Mono for figures and data.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/** The font variables for <html>: the root layout and global-error (which replaces it) both need them. */
export const fontVariables = `${archivo.variable} ${plexMono.variable}`;
