export interface AppItem {
  id: string;
  title: string;
  description: string;
  url: string;
  color: string;
  category: 'study' | 'web-extension' | 'dev' | 'life' | 'finance-security' | 'coming-soon';
  disabled?: boolean;
}
