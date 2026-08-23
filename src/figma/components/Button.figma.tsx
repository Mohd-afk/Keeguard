import { Button } from '@/ui/primitives/button';

/**
 * Figma SDS Code Connect Mapping for Button
 */
export const ButtonFigmaMapping = {
  component: Button,
  figmaNodeUrl: 'https://www.figma.com/design/sds-library?node-id=button-primitive',
  properties: {
    variant: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    size: ['default', 'sm', 'lg', 'icon'],
  },
};
