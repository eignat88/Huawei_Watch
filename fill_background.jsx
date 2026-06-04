#target photoshop

if (app.documents.length > 0) {
    var doc = app.activeDocument;

    app.activeDocument.selection.selectAll();
    app.activeDocument.selection.copy(true);

    var bgLayer = doc.paste();
    bgLayer.name = "Stretched blurred background";

    bgLayer.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);

    bgLayer.resize(140, 140, AnchorPosition.MIDDLECENTER);
    bgLayer.applyGaussianBlur(35);

    alert("Фон заполнен. Основной объект не изменён.");
} else {
    alert("Нет открытого документа.");
}