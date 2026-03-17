import CssBaseline from '@mui/material/CssBaseline';
import Stack from '@mui/material/Stack';
import AppTheme from '../shared-theme/AppTheme.jsx';
import ColorModeSelect from '../shared-theme/ColorModeSelect.jsx';
import SignInCard from './components/SignInCard.jsx';
import Content from './components/Content.jsx';
import { useContext } from 'react';
import { AuthProvider } from '../context/AuthContext.jsx';
// import logo from "../../public/conferenceWorld_logo";

export default function SignInSide(props) {

  return (
    <AppTheme {...props}>
      <div className='navbar' style={{display: "flex", alignItems: "center"}}>
          <a href="/" className='brand-name '>
            {/* <img src="/conferenceWorld_logo.png" alt="logo" /> */}
            <h2>ConferenceWorld</h2>
          </a>
          <ColorModeSelect sx={{ position: 'fixed', top: '1rem', right: '1rem' }} />
      </div>
      <CssBaseline enableColorScheme />
      
      <Stack
        direction="column"
        component="main"
        sx={[
          {
            justifyContent: 'center',
            height: 'calc((1 - var(--template-frame-height, 0)) * 100%)',
            marginTop: 'max(40px - var(--template-frame-height, 0px), 0px)',
            minHeight: '100%',
          },
          (theme) => ({
            '&::before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              zIndex: -1,
              inset: 0,
              backgroundImage:
                'radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))',
              backgroundRepeat: 'no-repeat',
              ...theme.applyStyles('dark', {
                backgroundImage:
                  'radial-gradient(at 50% 50%, hsla(210, 100%, 16%, 0.5), hsl(220, 30%, 5%))',
              }),
            },
          }),
        ]}
      >
        <Stack
          direction={{ xs: 'column-reverse', md: 'row' }}
          sx={{
            justifyContent: 'center',
            gap: { xs: 6, sm: 12 },
            p: 2,
            mx: 'auto',
          }}
        >
          <Stack
            direction={{ xs: 'column-reverse', md: 'row' }}
            sx={{
              justifyContent: 'center',
              gap: { xs: 6, sm: 12 },
              p: { xs: 2, sm: 4 },
              m: 'auto',
            }}
          >
            <SignInCard />
          </Stack>
        </Stack>
      </Stack>
    </AppTheme>
  );
}
