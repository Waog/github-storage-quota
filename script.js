import axios from "axios";

// --- Encryption Utilities ---
// Hard-coded key: exactly 32 ASCII characters.
const HARD_CODED_KEY = "Wz7R2GtcE6vHnF0Qp9Zs3Lx8Kd7Yt1J2";

async function getHardCodedKey() {
  const enc = new TextEncoder();
  const keyData = enc.encode(HARD_CODED_KEY);
  return crypto.subtle.importKey("raw", keyData, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptToken(token) {
  const key = await getHardCodedKey();
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(token)
  );
  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  };
}

async function decryptToken(encrypted) {
  const key = await getHardCodedKey();
  const iv = new Uint8Array(encrypted.iv);
  const ciphertext = new Uint8Array(encrypted.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// --- Token Storage Logic ---
const tokenInput = document.getElementById("tokenInput");
const storeCheckbox = document.getElementById("storeTokenCheckbox");
const storeLabel = document.getElementById("storeLabel");
const deleteTokenButton = document.getElementById("deleteTokenButton");

let storedTokenDecrypted = null;
deleteTokenButton.style.display = "none";

const storedEncryptedToken = localStorage.getItem("encryptedToken");
if (storedEncryptedToken) {
  try {
    const encryptedObj = JSON.parse(storedEncryptedToken);
    decryptToken(encryptedObj)
      .then((decryptedToken) => {
        tokenInput.value = decryptedToken;
        storedTokenDecrypted = decryptedToken;
        deleteTokenButton.style.display = "inline-block";
        updateCheckboxVisibility();
      })
      .catch((err) => console.error("Error decrypting token:", err));
  } catch (e) {
    console.error("Error parsing stored token:", e);
  }
}

tokenInput.addEventListener("input", updateCheckboxVisibility);
function updateCheckboxVisibility() {
  const currentToken = tokenInput.value.trim();
  if (currentToken && currentToken !== storedTokenDecrypted) {
    storeLabel.style.display = "inline-block";
  } else {
    storeLabel.style.display = "none";
  }
}

deleteTokenButton.addEventListener("click", () => {
  localStorage.removeItem("encryptedToken");
  tokenInput.value = "";
  storedTokenDecrypted = null;
  deleteTokenButton.style.display = "none";
  updateArtifactProgress("Remembered token deleted.", 0);
});

// --- Artifact Fetching Logic ---
let httpClient;

const artifactProgressText = document.getElementById("artifactProgressText");
const artifactProgressBar = document.getElementById("artifactProgressBar");
let totalProjects = 0;
let currentProjectIndex = 0;

document.getElementById("fetchButton").addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    alert("Please enter your GitHub token.");
    return;
  }
  if (storeCheckbox && storeCheckbox.checked) {
    if (
      !confirm(
        "⚠️ Storing your token on this device can be insecure. Do you wish to proceed?"
      )
    ) {
      return;
    }
    try {
      const encrypted = await encryptToken(token);
      localStorage.setItem("encryptedToken", JSON.stringify(encrypted));
      storedTokenDecrypted = token;
      deleteTokenButton.style.display = "inline-block";
    } catch (e) {
      console.error("Error encrypting token:", e);
    }
  }
  document.getElementById("fetchButton").style.display = "none";
  artifactProgressBar.style.display = "block";

  httpClient = axios.create({
    baseURL: "https://api.github.com",
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `token ${token}`,
    },
  });

  updateArtifactProgress("Fetching repositories...", 0);
  const projects = await getAllProjects();
  totalProjects = projects.length;
  currentProjectIndex = 0;
  updateArtifactProgress(
    `Found ${projects.length} repos. Fetching artifact lists...`,
    10
  );
  const results = {};
  for (let i = 0; i < projects.length; i++) {
    currentProjectIndex = i + 1;
    const project = projects[i];
    updateArtifactProgress(
      `Processing repo ${i + 1}/${projects.length}: ${project}`,
      Math.round((currentProjectIndex / totalProjects) * 100)
    );
    const artifacts = await fetchArtifactsForRepo(project);
    artifacts.sort((a, b) => b.size_in_bytes - a.size_in_bytes);
    updateArtifactProgress(
      `Repo ${project}: Found ${artifacts.length} artifact(s)`,
      Math.round((currentProjectIndex / totalProjects) * 100)
    );
    if (artifacts.length > 0) {
      results[project] = artifacts;
    }
  }
  updateArtifactProgress("Artifact lists fetched.", 100);

  const sortedResults = {};
  Object.keys(results)
    .sort((a, b) => {
      const totalA = results[a].reduce(
        (sum, art) => sum + art.size_in_bytes,
        0
      );
      const totalB = results[b].reduce(
        (sum, art) => sum + art.size_in_bytes,
        0
      );
      return totalB - totalA;
    })
    .forEach((key) => {
      sortedResults[key] = results[key];
    });

  renderResults(sortedResults);
  document.getElementById("fetchButton").style.display = "inline-block";
});

function updateArtifactProgress(message, percent = null) {
  artifactProgressText.textContent = message;
  if (percent !== null) {
    artifactProgressBar.value = percent;
  }
}

async function getAllProjects() {
  try {
    let page = 1;
    const pageSize = 100;
    let allProjects = [];
    let response;
    do {
      response = await httpClient.get(
        `/user/repos?per_page=${pageSize}&page=${page}`
      );
      allProjects = allProjects.concat(
        response.data.map((repo) => repo.full_name)
      );
      page++;
    } while (response.data.length === pageSize);
    return allProjects;
  } catch (err) {
    console.error("Error fetching repositories:", err);
    return [];
  }
}

async function fetchArtifactsForRepo(project) {
  let artifacts = [];
  let pageIndex = 1;
  const pageSize = 100;
  let response;
  do {
    updateArtifactProgress(
      `Repo ${project}: Fetching artifacts page ${pageIndex}`,
      null
    );
    const url = `/repos/${project}/actions/artifacts?per_page=${pageSize}&page=${pageIndex}`;
    try {
      response = await httpClient.get(url);
      for (const item of response.data.artifacts) {
        if (item.expired) continue;
        artifacts.push({
          id: item.id,
          name: item.name,
          size_in_bytes: item.size_in_bytes,
          workflowLink: null,
        });
      }
      pageIndex++;
    } catch (err) {
      console.error(`Error retrieving artifacts for ${project}:`, err);
      break;
    }
  } while (
    response.data.artifacts &&
    response.data.artifacts.length >= pageSize
  );
  return artifacts;
}

async function fetchAllWorkflowRuns(
  project,
  updateFn = updateArtifactProgress
) {
  let runs = [];
  let page = 1;
  const pageSize = 100;
  let response;
  updateFn("Fetching workflow runs (all pages)...", null);
  try {
    do {
      response = await httpClient.get(
        `/repos/${project}/actions/runs?per_page=${pageSize}&page=${page}`
      );
      const fetchedRuns = response.data.workflow_runs || [];
      runs = runs.concat(fetchedRuns);
      page++;
    } while (
      response.data.workflow_runs &&
      response.data.workflow_runs.length === pageSize
    );
    runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return runs;
  } catch (err) {
    console.error(`Error fetching workflow runs for ${project}:`, err);
    return runs;
  }
}

async function generateLinksForRepo(project, artifacts, updateLinkProgress) {
  updateLinkProgress(`Generating links for ${project}...`, 0);
  const runs = await fetchAllWorkflowRuns(project, updateLinkProgress);
  let remaining = new Map(artifacts.map((a) => [a.id, a]));
  const totalRuns = runs.length;
  for (let i = 0; i < totalRuns && remaining.size > 0; i++) {
    const run = runs[i];
    const percent = Math.round(((i + 1) / totalRuns) * 100);
    updateLinkProgress(
      `Repo ${project}: Processing run ${i + 1}/${totalRuns}`,
      percent
    );
    let attempts = [];
    try {
      const attemptsResponse = await httpClient.get(
        `/repos/${project}/actions/runs/${run.id}/attempts`
      );
      attempts = attemptsResponse.data;
    } catch (err) {
      if (err.response && err.response.status === 404) {
        updateLinkProgress(
          `Repo ${project}: Run ${
            i + 1
          }/${totalRuns} has no attempts endpoint; assuming attempt 1.`,
          percent
        );
        try {
          const fallbackArtifactsResponse = await httpClient.get(
            `/repos/${project}/actions/runs/${run.id}/artifacts?per_page=100`
          );
          const fallbackArtifacts =
            fallbackArtifactsResponse.data.artifacts || [];
          attempts = [{ run_attempt: 1, artifacts: fallbackArtifacts }];
        } catch (fallbackErr) {
          updateLinkProgress(
            `Repo ${project}: Fallback fetch failed for run ${run.id}`,
            percent
          );
          continue;
        }
      } else {
        console.error(
          `Error fetching attempts for run ${run.id} in ${project}:`,
          err
        );
        continue;
      }
    }
    for (const attempt of attempts) {
      let arts = [];
      if (attempt.artifacts) {
        arts = attempt.artifacts;
      } else {
        try {
          const artResp = await httpClient.get(
            `/repos/${project}/actions/runs/${run.id}/attempts/${attempt.run_attempt}/artifacts?per_page=100`
          );
          arts = artResp.data.artifacts || [];
        } catch (artErr) {
          console.error(
            `Error fetching artifacts for run ${run.id} attempt ${attempt.run_attempt} in ${project}:`,
            artErr
          );
          continue;
        }
      }
      for (const art of arts) {
        if (remaining.has(art.id)) {
          const link = `${run.html_url}/attempts/${attempt.run_attempt}`;
          const artifact = remaining.get(art.id);
          artifact.workflowLink = link;
          remaining.delete(art.id);
        }
      }
    }
  }
  updateLinkProgress(`Finished generating links for ${project}.`, 100);
  artifacts.forEach((a) => {
    if (!a.workflowLink) {
      a.workflowLink = `https://github.com/${project}/actions`;
    }
  });
  return artifacts;
}

function renderResults(results) {
  const outputDiv = document.getElementById("output");
  outputDiv.innerHTML = "";
  const repos = Object.keys(results).sort((a, b) => {
    const totalA = results[a].reduce((sum, art) => sum + art.size_in_bytes, 0);
    const totalB = results[b].reduce((sum, art) => sum + art.size_in_bytes, 0);
    return totalB - totalA;
  });
  repos.forEach((repo) => {
    const repoContainer = document.createElement("div");
    const artifacts = results[repo];
    artifacts.sort((a, b) => b.size_in_bytes - a.size_in_bytes);
    const totalSizeBytes = artifacts.reduce(
      (sum, art) => sum + art.size_in_bytes,
      0
    );
    const repoHeader = document.createElement("h2");
    repoHeader.textContent = `${repo} | Total Artifact Size: ${(
      totalSizeBytes /
      (1024 * 1024)
    ).toFixed(2)} MB`;
    repoContainer.appendChild(repoHeader);

    const linkContainer = document.createElement("div");
    linkContainer.classList.add("linkContainer");
    const needLinks = artifacts.some((a) => a.workflowLink === null);
    if (needLinks) {
      const genButton = document.createElement("button");
      genButton.textContent = "Generate Links";
      genButton.addEventListener("click", async () => {
        genButton.style.display = "none";
        // For generate links, create a container with the progress bar ABOVE the progress text.
        const progressBar = document.createElement("progress");
        progressBar.classList.add("linkProgressBar");
        progressBar.max = 100;
        progressBar.value = 0;
        const progressDiv = document.createElement("div");
        progressDiv.classList.add("linkProgressText");
        progressDiv.textContent = "Generating links...";
        linkContainer.appendChild(progressBar);
        linkContainer.appendChild(progressDiv);
        await generateLinksForRepo(repo, results[repo], (msg, percent) => {
          progressDiv.textContent = msg;
          progressBar.value = percent || 0;
        });
        renderResults(results);
      });
      linkContainer.appendChild(genButton);
    }
    repoContainer.appendChild(linkContainer);

    const hasLinks = artifacts.some((a) => a.workflowLink !== null);
    const tableEl = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const thArtifact = document.createElement("th");
    thArtifact.textContent = "Artifact";
    headerRow.appendChild(thArtifact);
    const thSize = document.createElement("th");
    thSize.textContent = "Size (MB)";
    headerRow.appendChild(thSize);
    if (hasLinks) {
      const thLink = document.createElement("th");
      thLink.textContent = "Link";
      headerRow.appendChild(thLink);
    }
    thead.appendChild(headerRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    artifacts.forEach((artifact) => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = artifact.name;
      tr.appendChild(tdName);
      const tdSize = document.createElement("td");
      tdSize.textContent = (artifact.size_in_bytes / (1024 * 1024)).toFixed(2);
      tr.appendChild(tdSize);
      if (hasLinks) {
        const tdLink = document.createElement("td");
        const aLink = document.createElement("a");
        aLink.href = artifact.workflowLink;
        aLink.textContent = "View Artifact";
        aLink.target = "_blank";
        tdLink.appendChild(aLink);
        tr.appendChild(tdLink);
      }
      tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);
    repoContainer.appendChild(tableEl);
    outputDiv.appendChild(repoContainer);
  });
}
