export interface MemeTemplate {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
}

export interface TextLayer {
  id: string;
  text: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  size: number; // Pixel size relative to base
  color: string;
  strokeColor: string;
  backgroundColor: string | null; // null = transparent
  rotation: number; // Degrees
  isUppercase: boolean;
}

export interface AISuggestion {
  caption: string;
}
