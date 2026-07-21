import yaml from 'js-yaml';

export function parseUpdateInfo(rawData, fileName, url) {
  let result;
  try {
    result = yaml.load(rawData);
  } catch (e) {
    throw new Error(`Failed to parse YAML from ${fileName}: ${e.message}`);
  }
  if (!result || typeof result !== 'object') {
    throw new Error(`Invalid update info in ${fileName}`);
  }
  const files = Array.isArray(result.files) ? result.files : [];
  if (files.length === 0) {
    throw new Error(`Update info doesn't contain files array in ${fileName}: ${JSON.stringify(result)}`);
  }
  const info = {
    version: result.version,
    files: files.map((fileInfo, index) => {
      if (typeof fileInfo !== 'object' || fileInfo === null) {
        throw new Error(`Invalid file entry at index ${index} in ${fileName}`);
      }
      const urlValue = typeof fileInfo.url === 'string' ? fileInfo.url : '';
      const sha2Value = typeof fileInfo.sha2 === 'string' ? fileInfo.sha2 : null;
      const sha512Value = typeof fileInfo.sha512 === 'string' ? fileInfo.sha512 : null;
      return {
        url: urlValue,
        sha2: sha2Value,
        sha512: sha512Value,
      };
    }),
    path: fileName,
    url,
  };
  return info;
}
