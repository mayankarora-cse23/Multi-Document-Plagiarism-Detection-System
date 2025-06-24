function readFile(file) {
  return new Promise((resolve, reject) => {
    const name = file.name.toLowerCase();

    if (name.endsWith(".docx")) {
      const reader = new FileReader();
      reader.onload = function (event) {
        mammoth.extractRawText({ arrayBuffer: event.target.result })
          .then(result => resolve(result.value.trim()))
          .catch(error => reject("DOCX read error: " + error));
      };
      reader.readAsArrayBuffer(file);
    }

    else if (name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.trim());
      reader.onerror = reject;
      reader.readAsText(file);
    }

    else if (name.endsWith(".pdf")) {
      const reader = new FileReader();
      reader.onload = function (event) {
        const typedArray = new Uint8Array(event.target.result);
        pdfjsLib.getDocument({ data: typedArray }).promise
          .then(async (pdfDoc) => {
            let textContent = "";
            for (let i = 1; i <= pdfDoc.numPages; i++) {
              const page = await pdfDoc.getPage(i);
              const text = await page.getTextContent();
              textContent += text.items.map(item => item.str).join(" ") + "\n";
            }
            resolve(textContent.trim());
          })
          .catch(error => reject("PDF read error: " + error));
      };
      reader.readAsArrayBuffer(file);
    }

    else {
      reject("Unsupported file type: " + file.name);
    }
  });
}

function jaccardSim(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return (intersection.size / union.size * 100).toFixed(2);
}

function kmpSearch(pattern, text) {
  function buildLPS(pattern) {
    const lps = Array(pattern.length).fill(0);
    let len = 0;
    for (let i = 1; i < pattern.length;) {
      if (pattern[i] === pattern[len]) {
        len++;
        lps[i++] = len;
      } else if (len) {
        len = lps[len - 1];
      } else {
        lps[i++] = 0;
      }
    }
    return lps;
  }

  const matches = [];
  const lps = buildLPS(pattern);
  let i = 0, j = 0;
  while (i < text.length) {
    if (pattern[j] === text[i]) {
      i++; j++;
    }
    if (j === pattern.length) {
      matches.push(i - j);
      j = lps[j - 1];
    } else if (i < text.length && pattern[j] !== text[i]) {
      j ? j = lps[j - 1] : i++;
    }
  }
  return matches.length;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[a.length][b.length];
}

function kShingling(text, k = 3) {
  const words = text.toLowerCase().split(/\s+/);
  const shingles = new Set();
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(" "));
  }
  return shingles;
}

async function getSemanticSimilarity(text1, text2) {
  const response = await fetch("http://localhost:5000/semantic-similarity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text1, text2 }),
  });
  const data = await response.json();
  return data.similarity;
}

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = document.getElementById("fileInput").files[0];
  const folder = document.getElementById("folderInput").files;
  const results = document.getElementById("results");
  const spinner = document.getElementById("spinner");
  const summary = document.getElementById("summary");
  const progressBar = document.getElementById("progressBar");
  const progressContainer = document.getElementById("progressContainer");

  results.innerHTML = "<h3>Comparison Results:</h3>";
  summary.classList.add("hidden");

  if (!file || folder.length === 0) {
    alert("Please upload both a file and a folder.");
    return;
  }

  try {
    spinner.classList.remove("hidden");
    progressContainer.classList.remove("hidden");

    const targetText = await readFile(file);
    let maxSimilarity = -1;
    let bestMatchFile = "";

    for (let i = 0; i < folder.length; i++) {
      const f = folder[i];
      const lowerName = f.name.toLowerCase();
      if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".docx") && !lowerName.endsWith(".txt")) {
        console.warn("Skipping unsupported file:", f.name);
        continue;
      }

      const text = await readFile(f);
      const jaccard = jaccardSim(targetText, text);
      const kmp = kmpSearch(targetText, text);
      const lev = levenshtein(targetText, text);
      const shingleA = kShingling(targetText);
      const shingleB = kShingling(text);
      const common = new Set([...shingleA].filter(s => shingleB.has(s)));
      const shingleSim = ((common.size / new Set([...shingleA, ...shingleB]).size) * 100).toFixed(2);
      const semanticSim = await getSemanticSimilarity(targetText, text);

      if (semanticSim > maxSimilarity) {
        maxSimilarity = semanticSim;
        bestMatchFile = f.name;
      }

      const html = `
        <div class="result-block">
          <strong>Compared with:</strong> ${f.name}<br>
          🔹 <strong>Jaccard Similarity:</strong> ${jaccard}%<br>
          🔹 <strong>KMP Exact Matches:</strong> ${kmp}<br>
          🔹 <strong>Levenshtein Distance:</strong> ${lev}<br>
          🔹 <strong>K-Shingling (3-word):</strong> ${shingleSim}%<br>
          🔹 <strong>Semantic Similarity:</strong> ${semanticSim.toFixed(2)}%<br>
        </div>
        <hr>
      `;
      results.insertAdjacentHTML("beforeend", html);

      // Update progress bar
      const percent = ((i + 1) / folder.length) * 100;
      progressBar.style.width = `${percent}%`;
    }

    summary.classList.remove("hidden");
    summary.innerHTML = `<strong>Most similar document:</strong> ${bestMatchFile}<br><strong>Semantic Similarity:</strong> ${maxSimilarity.toFixed(2)}%`;

  } catch (err) {
    console.error("Error processing files:", err);
    alert("An error occurred while processing files.");
  } finally {
    spinner.classList.add("hidden");
    progressContainer.classList.add("hidden");
  }
});

// Drag-and-drop
const dropZone = document.getElementById("dropZone");
dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.style.backgroundColor = "#bbdefb";
});
dropZone.addEventListener("dragleave", () => {
  dropZone.style.backgroundColor = "";
});
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.style.backgroundColor = "";
  const items = e.dataTransfer.items;
  for (const item of items) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file.webkitRelativePath) {
        document.getElementById("folderInput").files = e.dataTransfer.files;
      } else {
        document.getElementById("fileInput").files = e.dataTransfer.files;
      }
    }
  }
});
