import { downloadFile, downloadAllFilesAsZip } from '../../components/codegeneration/utils/fileDownload';

// Mock JSZip — all new JSZip() calls return the same shared instance
jest.mock('jszip', () => {
  const sharedInstance = {
    file: jest.fn(),
    generateAsync: jest.fn().mockResolvedValue(new Blob(['zip content'])),
  };
  const MockJSZip = jest.fn().mockReturnValue(sharedInstance);
  (MockJSZip as any)._instance = sharedInstance;
  return {
    __esModule: true,
    default: MockJSZip,
  };
});

// Mock DOM APIs
let mockLink: any;
beforeEach(() => {
  // Reset JSZip mock instance methods between tests
  // CRA's resetMocks:true clears mockReturnValue between tests — restore it
  const JSZip = (require('jszip') as any).default;
  JSZip.mockReturnValue(JSZip._instance);
  JSZip._instance.file.mockReset();
  JSZip._instance.generateAsync.mockReset();
  JSZip._instance.generateAsync.mockResolvedValue(new Blob(['zip content']));
  mockLink = {
    href: '',
    download: '',
    click: jest.fn(),
  };

  const originalCreateElement = document.createElement.bind(document);
  jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') return mockLink as any;
    return originalCreateElement(tag);
  });

  jest.spyOn(document.body, 'appendChild').mockImplementation((_el) => _el as any);
  jest.spyOn(document.body, 'removeChild').mockImplementation((_el) => _el as any);

  // Mock URL.createObjectURL and revokeObjectURL
  (window.URL as any).createObjectURL = jest.fn(() => 'blob:mocked-url');
  (window.URL as any).revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('downloadFile', () => {
  it('creates a download link and clicks it', () => {
    downloadFile('file content here', 'test.txt');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.download).toBe('test.txt');
    expect(mockLink.href).toBe('blob:mocked-url');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('appends and removes link from document body', () => {
    downloadFile('content', 'file.txt');

    expect(document.body.appendChild).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
  });
});

describe('downloadAllFilesAsZip', () => {
  it('does nothing when files array is empty', async () => {
    await downloadAllFilesAsZip([]);

    expect(mockLink.click).not.toHaveBeenCalled();
  });

  it('does nothing when files is null/undefined', async () => {
    await downloadAllFilesAsZip(null as any);

    expect(mockLink.click).not.toHaveBeenCalled();
  });

  it('creates zip and triggers download', async () => {
    const JSZip = (require('jszip') as any).default;
    const mockZipInstance = JSZip._instance;

    await downloadAllFilesAsZip(
      [
        { filename: 'file1.ts', content: 'export const x = 1;', metaclassName: 'A', targetFile: 'file1.ts' },
        { filename: 'file2.ts', content: 'export const y = 2;', metaclassName: 'B', targetFile: 'file2.ts' },
      ],
      'output.zip'
    );

    expect(mockZipInstance.file).toHaveBeenCalledTimes(2);
    expect(mockZipInstance.file).toHaveBeenCalledWith('file1.ts', 'export const x = 1;');
    expect(mockZipInstance.generateAsync).toHaveBeenCalledWith({ type: 'blob' });
    expect(mockLink.download).toBe('output.zip');
    expect(mockLink.click).toHaveBeenCalled();
    expect((window.URL as any).revokeObjectURL).toHaveBeenCalled();
  });

  it('uses default filename when not specified', async () => {
    await downloadAllFilesAsZip([
      { filename: 'file1.ts', content: 'content', metaclassName: 'A', targetFile: 'file1.ts' },
    ]);

    expect(mockLink.download).toBe('generated-artifacts.zip');
  });
});
