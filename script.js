function dataURLToUint8Array(dataURL) {
	const base64 = dataURL.split(",")[1];
	const binaryString = atob(base64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

const fileInput = document.getElementById("fileInput");
const selectBtn = document.getElementById("selectBtn");
const dropzone = document.getElementById("dropzone");
const compressBtn = document.getElementById("compressBtn");
const stats = document.getElementById("stats");
const downloadArea = document.getElementById("downloadArea");

let selectedFile = null;

selectBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
	if (e.target.files.length > 0) {
		selectedFile = e.target.files[0];
		compressBtn.disabled = false;
		const sizeKB = (selectedFile.size / 1024).toFixed(2);
		stats.textContent = `Selected: ${selectedFile.name} (${sizeKB} KB)`;
	}
});

dropzone.addEventListener("dragover", (e) => {
	e.preventDefault();
	dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

dropzone.addEventListener("drop", (e) => {
	e.preventDefault();
	dropzone.classList.remove("dragover");
	if (e.dataTransfer.files.length > 0) {
		selectedFile = e.dataTransfer.files[0];
		compressBtn.disabled = false;
		const sizeKB = (selectedFile.size / 1024).toFixed(2);
		stats.textContent = `Selected: ${selectedFile.name} (${sizeKB} KB)`;
	}
});

compressBtn.addEventListener("click", async () => {
	if (!selectedFile) return;

	compressBtn.disabled = true;
	stats.textContent = "Compressing...";
	downloadArea.innerHTML = "";

	try {
		const originalSizeKB = (selectedFile.size / 1024).toFixed(2);
		const compressedBlob = await compressPDF(selectedFile);
		const compressedSizeKB = (compressedBlob.size / 1024).toFixed(2);

		stats.textContent = `Original: ${originalSizeKB} KB | Compressed: ${compressedSizeKB} KB`;

		const downloadLink = document.createElement("a");
		downloadLink.href = URL.createObjectURL(compressedBlob);
		downloadLink.download = selectedFile.name.replace(/\.pdf$/i, "_compressed.pdf");
		downloadLink.textContent = "Download Compressed PDF";
		downloadArea.appendChild(downloadLink);
	} catch (e) {
		console.error(e);
		stats.textContent = "Compression failed. See console for details.";
	} finally {
		compressBtn.disabled = false;
	}
});

async function compressPDF(file) {
	const arrayBuffer = await file.arrayBuffer();
	const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
	const pages = pdfDoc.getPages();

	const level = document.querySelector("input[name='level']:checked").value;
	let quality = 0.9;
	if (level === "medium") quality = 0.6;
	if (level === "high") quality = 0.3;

	$("#progressContainer").show();
	$("#progressBar").css("width", "0%");

	// Process each page one by one to limit memory
	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		const resources = page.node.Resources?.() || {};
		const xobjects = resources.XObject?.() || {};

		for (const key in xobjects) {
			const xobj = xobjects[key];
			if (!xobj.lookup) continue;
			const subtype = xobj.lookup("Subtype")?.name;
			if (subtype === "Image") {
				try {
					const raw = await pdfDoc.context.lookup(xobj);
					if (!raw?.contents) continue;

					const imgBytes = raw.contents instanceof Uint8Array ? raw.contents : new Uint8Array(raw.contents);
					const imgBlob = new Blob([imgBytes]);
					const imgBitmap = await createImageBitmap(imgBlob);

					// Offscreen canvas to reduce memory usage
					const canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
					const ctx = canvas.getContext("2d");
					ctx.drawImage(imgBitmap, 0, 0);
					const compressedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
					const compressedBytes = new Uint8Array(await compressedBlob.arrayBuffer());

					raw.contents = compressedBytes;
				} catch (e) {
					console.warn("Skipped one image:", e);
				}
			}
		}

		const percent = Math.round(((i + 1) / pages.length) * 100);
		$("#progressBar").css("width", percent + "%");

		// Small delay to allow UI updates
		await new Promise((r) => setTimeout(r, 10));
	}

	const compressedBytes = await pdfDoc.save();
	$("#progressContainer").hide();
	return new Blob([compressedBytes], { type: "application/pdf" });
}
