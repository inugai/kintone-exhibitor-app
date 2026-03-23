import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { KintoneRestAPIClient } from '@kintone/rest-api-client';

// Kintoneクライアントの初期化（環境変数の読み込みを修正）
const client = new KintoneRestAPIClient({
  baseUrl: import.meta.env.VITE_KINTONE_BASE_URL,
  auth: { 
    apiToken: [
      import.meta.env.VITE_KINTONE_API_TOKEN, 
      import.meta.env.VITE_KINTONE_API_PLAN_TOKEN, 
      import.meta.env.VITE_KINTONE_API_EXHIBITOR_TOKEN
    ] 
  }
});

function App() {
  const [status, setStatus] = useState('待機中');
  const [exhibitorId, setExhibitorId] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  
  // スキャナーのインスタンスを保持するためのRef
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    console.log("Base URL:", import.meta.env.VITE_KINTONE_BASE_URL);
    console.log("API Token:", import.meta.env.VITE_KINTONE_API_PLAN_TOKEN) ;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('exh_id');
    if (id) {
      setExhibitorId(id);
    } else {
      setStatus("エラー: 出展者IDが指定されていません");
    }

    // コンポーネントが消える時にスキャナーを掃除する
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  // スキャン成功時の処理
  const handleScan = async (decodedText: string) => {
    if (!exhibitorId) return;

    // スキャナーを停止（Html5QrcodeScannerの場合はclearを使用）
    if (scannerRef.current) {
      try {
        await scannerRef.current.clear();
        setIsScanning(false);
      } catch (e) {
        console.error("停止エラー:", e);
      }
    }

    setStatus("照合中...");

    try {
      // 1. 来場者情報の照合
      const planResp = await client.record.getRecords({
        app: import.meta.env.VITE_APP_ID_PLAN,
        // フィールドコードはkintone側の設定に合わせてください
        query: `uuid = "${decodedText}" limit 1`
      });

      if (planResp.records.length === 0) {
        alert("無効なQRコードです");
        window.location.reload(); 
        return;
      }

      // 氏名フィールドから値を取得（record.氏名.value）
      const name = planResp.records[0].氏名.value as string;
      setVisitorName(name);

      // 2. 訪問履歴アプリへの登録
      await client.record.addRecord({
        app: import.meta.env.VITE_APP_ID_BOOTH_LOG,
        record: {
          出展者ID: { value: exhibitorId },
          uuid: { value: decodedText },
          // 日時はISO形式でOK
          日時: { value: new Date().toISOString() } 
        }
      });

      setStatus("✅ 登録完了");
      alert(`${name} 様の訪問を記録しました`);
      
      // 次のスキャンのためにリセット（またはそのまま待機）
      window.location.reload(); 

    } catch (err) {
      console.error(err);
      setStatus("❌ 通信エラー");
      alert("Kintoneとの通信に失敗しました。SettingsのSecretsを確認してください。");
    }
  };

  const startScanner = () => {
    if (isScanning) return;

    const scanner = new Html5QrcodeScanner(
      'reader', 
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      }, 
      /* verbose= */ false
    );

    scanner.render(
      (text) => handleScan(text), // 第一引数：成功時
      (_err) => { /* 読み取り中のエラーは無視 */ } // 第二引数：失敗時
    );

    scannerRef.current = scanner;
    setIsScanning(true);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#333' }}>ブース訪問記録</h2>
      <div style={{ background: '#f0f0f0', padding: '10px', borderRadius: '8px', marginBottom: '20px' }}>
         <strong>出展者ブース: {exhibitorId || '未設定'}</strong>
      </div>
      
      {exhibitorId ? (
        <>
          <div id="reader" style={{ width: '100%', maxWidth: '400px', margin: '0 auto', border: '1px solid #ccc' }}></div>
          {!isScanning && (
            <button 
              onClick={startScanner} 
              style={{ 
                marginTop: '20px', 
                padding: '15px 40px', 
                fontSize: '1.2rem', 
                background: '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              スキャン開始
            </button>
          )}
        </>
      ) : (
        <p style={{ color: 'red', fontWeight: 'bold' }}>⚠️ 専用のURL（?exh_id=xxx付き）からアクセスしてください</p>
      )}

      <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <p>ステータス: <span style={{ color: status.includes('✅') ? 'green' : 'black' }}>{status}</span></p>
        {visitorName && <p>最終スキャン: <strong>{visitorName} 様</strong></p>}
      </div>
    </div>
  );
}

export default App;