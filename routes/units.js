const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const upload = multer({ storage: multer.memoryStorage() });

// Función auxiliar para determinar la ruta del archivo de datos de unidades
function getUnitsFilePath() {
    const dataFolderPath = path.join(__dirname, '../data/units.json');
    if (fs.existsSync(dataFolderPath)) {
        return dataFolderPath;
    }
    return path.join(__dirname, '../units.json');
}

// Función auxiliar para leer unidades del JSON
function readUnitsFromFile() {
    try {
        const filePath = getUnitsFilePath();
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (err) {
        console.error('Error al leer unidades:', err);
        return [];
    }
}

// Función auxiliar para guardar unidades en el JSON
function saveUnitsToFile(units) {
    try {
        const filePath = getUnitsFilePath();
        // Asegurar que la carpeta exista
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(units, null, 2), 'utf8');
    } catch (err) {
        console.error('Error al guardar unidades:', err);
        throw err;
    }
}

// GET /: Obtener todas las unidades
router.get('/', (req, res) => {
    try {
        const units = readUnitsFromFile();
        res.json(units);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las unidades.' });
    }
});

// POST /:id/verify-pin: Verificar el PIN de la unidad (Soluciona el error 404)
router.post('/:id/verify-pin', (req, res) => {
    try {
        const { id } = req.params;
        const { pin } = req.body;

        const units = readUnitsFromFile();
        const unit = Array.isArray(units) ? units.find(u => 
            u && (String(u.id) === String(id) || String(u.unidad) === String(id))
        ) : null;

        if (!unit) {
            return res.status(404).json({ error: 'Unidad no encontrada.' });
        }

        if (unit.pin && String(unit.pin).trim() !== String(pin || '').trim()) {
            return res.status(400).json({ error: 'El PIN ingresado es incorrecto.' });
        }

        res.json({ ok: true, success: true, unit });
    } catch (err) {
        res.status(500).json({ error: 'Error al verificar el PIN.' });
    }
});

// POST /add: Agregar manualmente una o más unidades a las existentes
router.post('/add', (req, res) => {
    try {
        const currentUnits = readUnitsFromFile();
        const newUnitsData = Array.isArray(req.body) ? req.body : [req.body];

        const formattedNewUnits = newUnitsData.map((u, index) => ({
            id: u.id || `u_${Date.now()}_${index}`,
            unidad: u.unidad || u.id || '',
            piso: u.piso || '',
            depto: u.depto || '',
            propietario: u.propietario || '',
            pin: u.pin || Math.floor(1000 + Math.random() * 9000).toString()
        }));

        const updatedUnits = [...currentUnits, ...formattedNewUnits];
        saveUnitsToFile(updatedUnits);

        res.json({ success: true, message: 'Unidades agregadas con éxito.', added: formattedNewUnits.length });
    } catch (error) {
        res.status(500).json({ error: 'Error al agregar unidades.' });
    }
});

// POST /import-excel: Importar unidades desde un archivo Excel
router.post('/import-excel', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo Excel.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const importedUnits = rows.map((row, index) => ({
            id: String(row['Unidad'] || row['unidad'] || `u_${Date.now()}_${index}`),
            unidad: String(row['Unidad'] || row['unidad'] || ''),
            piso: String(row['Piso'] || row['piso'] || row['piso/dto'] || row['PISO/DTO'] || ''),
            depto: String(row['Depto'] || row['depto'] || ''),
            propietario: String(row['Propietario'] || row['propietario'] || ''),
            pin: String(row['PIN'] || row['pin'] || Math.floor(1000 + Math.random() * 9000))
        }));

        const replaceAll = req.query.replace === 'true';
        let finalUnits = [];

        if (replaceAll) {
            finalUnits = importedUnits;
        } else {
            const currentUnits = readUnitsFromFile();
            finalUnits = [...currentUnits, ...importedUnits];
        }

        saveUnitsToFile(finalUnits);

        res.json({
            success: true,
            message: `Se importaron ${importedUnits.length} unidades correctamente.`,
            count: importedUnits.length
        });
    } catch (error) {
        console.error('Error al procesar el Excel:', error);
        res.status(500).json({ error: 'Error al procesar el archivo Excel.' });
    }
});

// DELETE /delete: Eliminar unidades (todas o seleccionadas)
router.delete('/delete', (req, res) => {
    try {
        const { ids, deleteAll } = req.body;

        if (deleteAll) {
            saveUnitsToFile([]);
            return res.json({ success: true, message: 'Todas las unidades han sido eliminadas.' });
        }

        if (Array.isArray(ids) && ids.length > 0) {
            const currentUnits = readUnitsFromFile();
            const filteredUnits = currentUnits.filter(u => 
                !ids.includes(String(u.id)) && 
                !ids.includes(String(u.unidad))
            );
            saveUnitsToFile(filteredUnits);
            return res.json({ success: true, message: 'Unidades seleccionadas eliminadas.' });
        }

        res.status(400).json({ error: 'Parámetros de eliminación inválidos.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar unidades.' });
    }
});

module.exports = router;
