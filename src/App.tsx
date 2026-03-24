import { useEffect, useState, useRef } from 'react';
// @ts-ignore
import { Html5QrcodeScanner } from 'html5-qrcode';
// @ts-ignore
import { KintoneRestAPIClient } from '@kintone/rest-api-client';

/**
 * 環境変数を安全に取得するヘルパー
 */
const getEnv = (key: string): string => {
  try {
    return import.meta.env[key] || '';
  } catch (e) {
    return '';
  }
};

/**
 * Kintoneクライアント初期化
 */
const client = new KintoneRestAPIClient({
  baseUrl: getEnv('VITE_KINTONE_BASE_URL'),
  auth: { 
    apiToken: [
      getEnv('VITE_KINTONE_API_TOKEN'),      
      getEnv('VITE_KINTONE_API_PLAN_TOKEN'),  
      getEnv('VITE_KINTONE_API_EXH_TOKEN')   
    ]
  }
});

function App() {
  const [status, setStatus] = useState('初期化中...');
  const [exhibitorId, setExhibitorId] = useState('');
  const [exhibitorName, setExhibitorName] = useState(''); 
 // const [visitorName, setVisitorName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isValidId, setIsValidId] = useState(false); 
  
  const scannerRef = useRef<any>(null);

  useEffect(() => {

    console.log('VITE_APP_ID_EXHIBITOR', getEnv('VITE_APP_ID_EXHIBITOR'));
    console.log('VITE_APP_ID_PLAN', getEnv('VITE_APP_ID_PLAN'));
    console.log('VITE_APP_ID_BOOTH_LOG', getEnv('VITE_APP_ID_BOOTH_LOG'));
    
    const validateExhibitor = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('exh_id');
      
      if (!id) {
        setStatus("❌ エラー: URLにIDが含まれていません。");
        return;
      }

      try {
        // 出展者リストアプリにIDが存在するかチェック
        const resp = await client.record.getRecords({
          app: getEnv('VITE_APP_ID_EXHIBITOR'),
          query: `uuid = "${id}" limit 1`
        });

        if (resp.records.length > 0) {
          setExhibitorId(id);
          const name = resp.records[0].出展者名?.value || id;
          setExhibitorName(name as string);
          setIsValidId(true);
          setStatus("スキャン待機中");
        } else {
          setStatus(`❌ エラー: ID「${id}」は登録されていません。`);
          setIsValidId(false);
        }
      } catch (err) {
        console.error(err);
        setStatus("⚠️ 接続エラー: 出展者情報の照合に失敗しました。");
      }
    };

    validateExhibitor();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, []);

  const handleScan = async (decodedText: string) => {
    if (!isValidId) return;

    if (scannerRef.current) {
      try {
        await scannerRef.current.clear();
        setIsScanning(false);
      } catch (e) { console.error(e); }
    }

    setStatus("照合中...");

    try {
      // 1. 来場予定アプリ照合
      const planResp = await client.record.getRecords({
        app: getEnv('VITE_APP_ID_PLAN'),
        query: `uuid = "${decodedText}" limit 1`
      });

      if (planResp.records.length === 0) {
        alert("無効なQRコードです。");
        window.location.reload(); 
        return;
      }

      const name = planResp.records[0].氏名.value as string;
     // setVisitorName(name);

      // 2. 訪問履歴登録
      await client.record.addRecord({
        app: getEnv('VITE_APP_ID_BOOTH_LOG'),
        record: {
          出展者ID: { value: exhibitorId }, 
          uuid: { value: decodedText },
          日時: { value: new Date().toISOString() } 
        }
      });

      setStatus("✅ 登録完了");
      alert(`${name} 様の訪問を記録しました`);
      window.location.reload(); 

    } catch (err) {
      console.error(err);
      setStatus("❌ 登録失敗");
      alert("Kintoneへの登録に失敗しました。");
    }
  };

  const startScanner = () => {
    if (isScanning || !isValidId) return;
    try {
      const scanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: 250 }, false);
      scanner.render((text: string) => handleScan(text), () => {});
      scannerRef.current = scanner;
      setIsScanning(true);
    } catch (e) {
      console.error(e);
      alert("スキャナーの起動に失敗しました。");
    }
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '20px' }}>ブース訪問記録</h2>
      
      <div style={{ 
        background: isValidId ? '#e3f2fd' : '#ffebee', 
        padding: '15px', borderRadius: '12px', marginBottom: '20px',
        border: `1px solid ${isValidId ? '#90caf9' : '#ef9a9a'}`
      }}>
         <div style={{ fontSize: '0.8rem', color: '#666' }}>ログイン中のブース</div>
         <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{exhibitorName || '---'}</div>
         <div style={{ fontSize: '0.7rem', color: '#888' }}>ID: {exhibitorId || '未認証'}</div>
      </div>
      
      <p style={{ fontWeight: 'bold', color: isValidId ? '#2e7d32' : '#c62828' }}>ステータス: {status}</p>

      {isValidId && (
        <div style={{ marginTop: '20px' }}>
          <div id="reader" style={{ width: '100%', borderRadius: '15px', border: '1px solid #ddd' }}></div>
          {!isScanning && (
            <button onClick={startScanner} style={{ 
                marginTop: '30px', padding: '18px 0', fontSize: '1.2rem', 
                background: '#1a73e8', color: 'white', border: 'none', 
                borderRadius: '30px', cursor: 'pointer', fontWeight: 'bold', width: '100%' 
            }}>
              スキャン開始
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;