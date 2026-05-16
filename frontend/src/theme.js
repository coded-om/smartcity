import { createTheme, alpha } from '@mui/material/styles';

// ─── MD3 Cyber Blue Palette ─────────────────────────────────────────────────
const MD3 = {
  // Primary — Cyber Blue
  primary:            '#1565C0',
  primaryLight:       '#5E92F3',
  primaryDark:        '#003C8F',
  primaryContainer:   '#D3E4FF',
  onPrimaryContainer: '#001C3D',
  // Secondary — Teal Blue
  secondary:            '#006495',
  secondaryLight:       '#4B93C8',
  secondaryDark:        '#003865',
  secondaryContainer:   '#CAE7FF',
  onSecondaryContainer: '#001E30',
  // Tertiary — Muted Violet accent
  tertiary:            '#5B5EA6',
  tertiaryContainer:   '#E2DFFF',
  // Error
  error:            '#BA1A1A',
  errorContainer:   '#FFDAD6',
  onErrorContainer: '#410002',
  // Surfaces (light)
  surfaceDim:      '#D9DBE0',
  surface:         '#FAFCFF',
  surfaceBright:   '#F9FBFE',
  surfaceVariant:  '#DDE3EA',
  // Text
  onSurface:        '#1A1C1E',
  onSurfaceVariant: '#41484D',
  outline:          '#72787E',
  outlineVariant:   '#C1C7CE',
  // Status helpers
  success: '#006E2C',
  successContainer: '#98F5A0',
  warning: '#7D5700',
  warningContainer: '#FFDEA6',
  info: '#006493',
  infoContainer: '#CAE7FF',
};

const MD3_DARK = {
  primary:            '#A0C4FF',
  primaryLight:       '#D3E4FF',
  primaryDark:        '#5E92F3',
  primaryContainer:   '#003F8A',
  onPrimaryContainer: '#D3E4FF',
  secondary:            '#90CAFF',
  secondaryLight:       '#CAE7FF',
  secondaryDark:        '#4B93C8',
  secondaryContainer:   '#004C71',
  onSecondaryContainer: '#CAE7FF',
  tertiary:            '#C3C3FF',
  tertiaryContainer:   '#43466B',
  error:            '#FFB4AB',
  errorContainer:   '#93000A',
  onErrorContainer: '#FFDAD6',
  surfaceDim:      '#11131A',
  surface:         '#1A1C22',
  surfaceBright:   '#393B45',
  surfaceVariant:  '#41484D',
  onSurface:        '#E3E2E6',
  onSurfaceVariant: '#C1C7CE',
  outline:          '#8B9198',
  outlineVariant:   '#41484D',
  success: '#78DC77',
  successContainer: '#00531B',
  warning: '#FAC300',
  warningContainer: '#5D4200',
  info: '#90CAFF',
  infoContainer: '#004C71',
};

const componentOverrides = (mode) => {
  const p = mode === 'light' ? MD3 : MD3_DARK;
  const isLight = mode === 'light';
  return {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        body: { margin: 0, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        '::-webkit-scrollbar': { width: 6, height: 6 },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': { background: isLight ? '#C1C7CE' : '#41484D', borderRadius: 3 },
        '::-webkit-scrollbar-thumb:hover': { background: '#72787E' },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 50,
          textTransform: 'none',
          fontWeight: 500,
          letterSpacing: '0.006rem',
          padding: '8px 24px',
        },
        sizeSmall: { padding: '6px 16px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '10px 28px', fontSize: '0.9375rem' },
        contained: {
          '&:hover': { boxShadow: '0 1px 2px rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15)' },
        },
        outlined: { borderWidth: 1 },
      },
    },

    MuiFab: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: '0 1px 2px rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15)',
        },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundImage: 'none',
          border: `1px solid ${p.outlineVariant}`,
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${p.outlineVariant}`,
        },
        rounded: { borderRadius: 16 },
        elevation0: { border: `1px solid ${p.outlineVariant}` },
        elevation1: {
          border: 'none',
          boxShadow: isLight
            ? '0 1px 2px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.06)'
            : '0 1px 2px rgba(0,0,0,.4), 0 1px 3px rgba(0,0,0,.3)',
        },
        elevation2: {
          border: 'none',
          boxShadow: isLight
            ? '0 2px 4px rgba(0,0,0,.1), 0 1px 6px rgba(0,0,0,.08)'
            : '0 2px 4px rgba(0,0,0,.5), 0 1px 6px rgba(0,0,0,.4)',
        },
        elevation3: {
          border: 'none',
          boxShadow: isLight
            ? '0 4px 8px rgba(0,0,0,.1), 0 2px 8px rgba(0,0,0,.08)'
            : '0 4px 8px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.4)',
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500, fontSize: '0.75rem' },
        sizeSmall: { height: 24, fontSize: '0.6875rem' },
      },
    },

    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': { borderRadius: 12 },
        },
      },
    },

    MuiSelect: {
      styleOverrides: {
        outlined: { borderRadius: 12 },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: '0.875rem' },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderBottom: `1px solid ${p.outlineVariant}`,
          backgroundColor: isLight ? p.surface : p.surface,
          color: p.onSurface,
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          borderRight: `1px solid ${p.outlineVariant}`,
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 100,
          margin: '2px 8px',
          padding: '8px 12px',
          '&.Mui-selected': {
            backgroundColor: alpha(p.primary, 0.12),
            color: p.primary,
            '&:hover': { backgroundColor: alpha(p.primary, 0.18) },
          },
          '&:hover': { backgroundColor: alpha(p.onSurface, 0.08) },
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          letterSpacing: '0.006rem',
          minWidth: 80,
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, borderRadius: '3px 3px 0 0' },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${isLight ? '#DDE3EA' : '#2D3136'}`, padding: '10px 16px' },
        head: {
          fontWeight: 600,
          fontSize: '0.6875rem',
          letterSpacing: '0.05rem',
          textTransform: 'uppercase',
          color: p.onSurfaceVariant,
          backgroundColor: isLight ? '#F0F4FF' : '#1E2128',
          borderBottom: `2px solid ${p.outlineVariant}`,
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: alpha(p.onSurface, 0.04) },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12 },
        standardError: { backgroundColor: isLight ? '#FFDAD6' : '#410002', color: isLight ? '#410002' : '#FFDAD6' },
        standardWarning: { backgroundColor: isLight ? '#FFDEA6' : '#5D4200', color: isLight ? '#4A3300' : '#FFDEA6' },
        standardSuccess: { backgroundColor: isLight ? '#98F5A0' : '#00531B', color: isLight ? '#003B16' : '#98F5A0' },
        standardInfo: { backgroundColor: isLight ? '#CAE7FF' : '#004C71', color: isLight ? '#001E30' : '#CAE7FF' },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 8, fontSize: '0.75rem' },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 28, backgroundImage: 'none' },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: '1.375rem', fontWeight: 400, paddingBottom: 8 },
      },
    },

    MuiSlider: {
      styleOverrides: {
        root: { height: 6 },
        thumb: { width: 20, height: 20 },
        track: { borderRadius: 3 },
        rail: { borderRadius: 3, opacity: 0.3 },
      },
    },

    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: '12px !important',
          border: `1px solid ${p.outlineVariant}`,
          '&:before': { display: 'none' },
          marginBottom: 8,
          backgroundImage: 'none',
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: { borderRadius: 12, padding: '0 16px', minHeight: 52 },
        content: { margin: '14px 0' },
      },
    },

    MuiAccordionDetails: {
      styleOverrides: {
        root: { padding: '0 16px 16px' },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 6, height: 6 },
        bar: { borderRadius: 6 },
      },
    },

    MuiCircularProgress: {
      styleOverrides: {
        root: { display: 'block' },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: p.outlineVariant },
      },
    },

    MuiAvatar: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          '&:hover': { backgroundColor: alpha(p.onSurface, 0.08) },
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: { fontWeight: 700, fontSize: '0.6875rem' },
      },
    },
  };
};

// ─── Theme Factory ───────────────────────────────────────────────────────────
const createAppTheme = (mode = 'light') => {
  const p = mode === 'light' ? MD3 : MD3_DARK;
  const isLight = mode === 'light';

  return createTheme({
    palette: {
      mode,
      primary:   { main: p.primary, light: p.primaryLight, dark: p.primaryDark, contrastText: isLight ? '#FFFFFF' : '#001C3D' },
      secondary: { main: p.secondary, light: p.secondaryLight, dark: p.secondaryDark, contrastText: '#FFFFFF' },
      error:     { main: p.error, contrastText: '#FFFFFF' },
      warning:   { main: p.warning, contrastText: '#FFFFFF' },
      success:   { main: p.success, contrastText: '#FFFFFF' },
      info:      { main: p.info, contrastText: '#FFFFFF' },
      background: {
        default: isLight ? '#EFF3FF' : '#11131A',
        paper:   isLight ? p.surface  : p.surface,
      },
      text: {
        primary:   p.onSurface,
        secondary: p.onSurfaceVariant,
        disabled:  p.outline,
      },
      divider: p.outlineVariant,
      // Custom MD3 tokens exposed via palette
      md3: {
        primaryContainer:    p.primaryContainer,
        onPrimaryContainer:  p.onPrimaryContainer,
        secondaryContainer:  p.secondaryContainer,
        onSecondaryContainer:p.onSecondaryContainer,
        tertiaryContainer:   p.tertiaryContainer,
        surfaceVariant:      p.surfaceVariant,
        onSurfaceVariant:    p.onSurfaceVariant,
        outlineVariant:      p.outlineVariant,
        outline:             p.outline,
        successContainer:    p.successContainer,
        warningContainer:    p.warningContainer,
        infoContainer:       p.infoContainer,
        errorContainer:      p.errorContainer,
        onErrorContainer:    p.onErrorContainer,
      },
    },

    typography: {
      fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
      h1: { fontSize: '2rem',     fontWeight: 400, letterSpacing: 0 },
      h2: { fontSize: '1.75rem',  fontWeight: 400, letterSpacing: 0 },
      h3: { fontSize: '1.5rem',   fontWeight: 400, letterSpacing: 0 },
      h4: { fontSize: '1.375rem', fontWeight: 400, letterSpacing: 0 },
      h5: { fontSize: '1rem',     fontWeight: 500, letterSpacing: '0.009rem' },
      h6: { fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.006rem' },
      subtitle1: { fontSize: '1rem',     fontWeight: 400, letterSpacing: '0.009rem' },
      subtitle2: { fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.006rem' },
      body1:     { fontSize: '1rem',     fontWeight: 400, letterSpacing: '0.009rem' },
      body2:     { fontSize: '0.875rem', fontWeight: 400, letterSpacing: '0.016rem' },
      caption:   { fontSize: '0.75rem',  fontWeight: 400, letterSpacing: '0.025rem' },
      overline:  { fontSize: '0.6875rem',fontWeight: 500, letterSpacing: '0.031rem', textTransform: 'uppercase' },
      button:    { fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.006rem' },
    },

    shape: { borderRadius: 12 },

    components: componentOverrides(mode),
  });
};

export default createAppTheme;
