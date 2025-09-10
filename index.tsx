import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const App = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<Record<string, string> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      setExtractedData(null);
      setError(null);
      setImagePreview(null); // Reset preview on new file selection

      // Only generate a preview if the file is an image
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // remove "data:mime/type;base64," prefix
        resolve(result.split(',')[1]);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleExtract = async () => {
    if (!imageFile) return;

    setIsLoading(true);
    setError(null);
    setExtractedData(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Image = await fileToBase64(imageFile);

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: imageFile.type,
                data: base64Image,
              },
            },
            {
              text: "From the provided document, extract the following information: '요청 기관' (the name of the police station), '요청자' (the name of the police officer, often near their title '순경' or '경찰관'), '접수번호/영장번호' (the warrant number, e.g., 2025-32274), '이메일주소' (the email address, typically ending in @police.go.kr), and '압수할 물건' (the full text describing the items to be seized, which is a long paragraph). Return the response as a JSON object. If any information is not found, use an empty string for its value."
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              requestingOrg: { type: Type.STRING, description: '요청 기관' },
              requestorName: { type: Type.STRING, description: '요청자' },
              warrantNumber: { type: Type.STRING, description: '접수번호/영장번호' },
              email: { type: Type.STRING, description: '이메일주소' },
              itemsToSeize: { type: Type.STRING, description: '압수할 물건' },
            }
          },
        },
      });
      
      const parsedData = JSON.parse(response.text);
      
      let requestingOrgProcessed = String(parsedData.requestingOrg || '');
      const policeStationIndex = requestingOrgProcessed.indexOf('경찰서');
      if (policeStationIndex !== -1) {
          // Slice the string up to the end of "경찰서"
          requestingOrgProcessed = requestingOrgProcessed.substring(0, policeStationIndex + 3);
      }

      const finalData = {
        '요청 기관': requestingOrgProcessed,
        '(외부)요청자': String(parsedData.requestorName || ''),
        '접수번호/영장번호': String(parsedData.warrantNumber || ''),
        '(내부)처리자': '',
        '분쟁 개입 여부': 'X',
        '민원인UID': '',
        '주문번호': '',
        '2차 민원시트': '',
        '2차 처리결과': '',
        '공문 처리결과': '완료',
        '처리결과 상세': '',
        '공문 발송여부': '',
        '정보 제공 여부': 'O',
        '이메일주소': String(parsedData.email || ''),
        '압수할 물건': String(parsedData.itemsToSeize || ''),
      };

      setExtractedData(finalData);

    } catch (err) {
      console.error(err);
      setError('정보 추출에 실패했습니다. 파일이 선명한지 확인 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!extractedData) return;
    
    const headers = Object.keys(extractedData);
    const values = Object.values(extractedData);

    const csvContent = [
      headers.join(','),
      values.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
    ].join('\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `추출_결과_${extractedData['접수번호/영장번호'] || 'data'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const TableRow = ({ label, value }: { label: string; value: string }) => (
    <tr>
      <th>{label}</th>
      <td>{value}</td>
    </tr>
  );

  return (
    <div className="container">
      <header>
        <h1>경찰 공문 정보 추출기</h1>
        <p>공문 이미지 또는 PDF 파일을 업로드하여 주요 정보를 추출하고 엑셀로 저장하세요.</p>
      </header>
      
      <main>
        <div className="upload-section">
          <label htmlFor="file-upload" className="file-input-label">
            공문 파일 선택 (이미지/PDF)
          </label>
          <input
            id="file-upload"
            type="file"
            accept="image/png, image/jpeg, image/webp, application/pdf"
            onChange={handleFileChange}
            aria-label="공문 파일 업로드"
          />
          {imageFile && <p className="file-name">{imageFile.name}</p>}
          {imagePreview && <img src={imagePreview} alt="업로드된 공문 이미지 미리보기" className="image-preview" />}
        </div>

        <div className="controls">
          <button onClick={handleExtract} className="btn btn-primary" disabled={!imageFile || isLoading}>
            {isLoading ? <div className="loading-spinner"></div> : '정보 추출'}
          </button>
        </div>
        
        {error && <p className="error-message">{error}</p>}

        {extractedData && (
          <section className="results-section" aria-live="polite">
            <h2>추출 결과</h2>
            <table className="results-table">
              <tbody>
                {Object.entries(extractedData).map(([key, value]) => (
                  <TableRow key={key} label={key} value={value} />
                ))}
              </tbody>
            </table>
             <div className="controls">
                <button onClick={handleDownload} className="btn btn-secondary">
                  엑셀(CSV)로 다운로드
                </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);