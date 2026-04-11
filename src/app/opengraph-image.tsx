import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Keizaal Live Streams';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  const cinzelFontData = await fetch(
    new URL('https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-lbgTYo.ttf')
  ).then((res) => res.arrayBuffer());

  const interFontData = await fetch(
    new URL('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf')
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          background: '#09090b',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: '24px solid #227961',
          padding: '80px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            fontSize: 120, 
            fontWeight: 800, 
            color: 'white',
            letterSpacing: '0.15em',
            fontFamily: '"Cinzel"'
          }}>
            KEIZAAL <span style={{ color: '#227961', marginLeft: '40px' }}>LIVE</span>
          </div>
          <p style={{ 
            fontSize: 48, 
            color: '#a1a1aa', 
            marginTop: '60px',
            textAlign: 'center',
            maxWidth: '900px',
            lineHeight: 1.5,
            fontFamily: '"Inter"'
          }}>
            Discover Keizaal RP Live Streams
          </p>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Cinzel',
          data: cinzelFontData,
          style: 'normal',
          weight: 800,
        },
        {
          name: 'Inter',
          data: interFontData,
          style: 'normal',
          weight: 500,
        },
      ],
    }
  );
}
